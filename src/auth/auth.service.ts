import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { MailQueueService } from '../queue/queue.module';
import { RedisService } from '../redis/redis.module';
import { isProduction } from '../common/prod-guard';
import { serializeOpsUser, serializeUser } from '../common/serializers';
import { AuthUser } from '../common/types/auth-user';
import {
  LoginDto,
  ForgotPasswordDto,
  ResendSignupOtpDto,
  ResetPasswordDto,
  SignupDto,
  VerifySignupOtpDto,
} from './dto/auth.dto';

const BCRYPT_ROUNDS = 12;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const SIGNUP_PURPOSE = 'signup';
const RESET_PURPOSE = 'password_reset';
const OTP_RESEND_WINDOW_SEC = 60 * 15;
const OTP_RESEND_MAX = 5;
const LOGIN_FAIL_MAX = 10;
const LOGIN_FAIL_WINDOW_SEC = 60 * 15;
/** Valid bcrypt hash used only to equalize login timing when email is unknown. */
const DUMMY_PASSWORD_HASH =
  '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW';

type SignupPayload = {
  name: string;
  phone: string;
  passwordHash: string;
  accountType: 'personal' | 'starting_business' | 'business';
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly mailQueue: MailQueueService,
    private readonly redis: RedisService,
  ) {}

  /** Start signup: store pending credentials and enqueue OTP email. */
  async startSignup(input: SignupDto) {
    this.assertMailReadyForOtp();
    const email = input.email.trim().toLowerCase();
    await this.assertOtpResendBudget(email);

    const existing = await this.prisma.credential.findUnique({
      where: { email },
    });
    // Generic response: do not reveal whether the email is registered.
    if (existing) {
      return {
        ok: true as const,
        email,
        expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
        emailDelivered: this.mail.isConfigured(),
      };
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const code = this.generateOtp();
    const payload: SignupPayload = {
      name: input.name.trim(),
      phone: input.phone.trim(),
      passwordHash,
      accountType: input.accountType,
    };

    await this.prisma.emailOtp.deleteMany({
      where: { email, purpose: SIGNUP_PURPOSE },
    });
    await this.prisma.emailOtp.create({
      data: {
        email,
        purpose: SIGNUP_PURPOSE,
        codeHash: this.hashOtp(email, code),
        payloadJson: JSON.stringify(payload),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });

    const queued = await this.mailQueue.enqueue({
      to: email,
      subject: 'Your ConnectPort verification code',
      headline: 'Confirm your email',
      body: `Hi ${payload.name},\n\nEnter this code to finish creating your ConnectPort account. It expires in 10 minutes.`,
      code,
    });

    const allowDevCode =
      !isProduction(this.config) &&
      (!this.mail.isConfigured() || !queued.queued);

    return {
      ok: true as const,
      email,
      expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
      emailDelivered: this.mail.isConfigured(),
      ...(allowDevCode ? { devCode: code } : {}),
    };
  }

  async resendSignupOtp(input: ResendSignupOtpDto) {
    this.assertMailReadyForOtp();
    const email = input.email.trim().toLowerCase();
    await this.assertOtpResendBudget(email);

    const pending = await this.prisma.emailOtp.findFirst({
      where: { email, purpose: SIGNUP_PURPOSE },
      orderBy: { createdAt: 'desc' },
    });
    if (!pending) {
      throw new BadRequestException(
        'No pending signup for this email. Start signup again.',
      );
    }

    let payload: SignupPayload;
    try {
      payload = JSON.parse(pending.payloadJson) as SignupPayload;
    } catch {
      throw new BadRequestException('Signup session expired. Start again.');
    }

    const code = this.generateOtp();
    await this.prisma.emailOtp.update({
      where: { id: pending.id },
      data: {
        codeHash: this.hashOtp(email, code),
        // Keep attempts across resends so attackers cannot reset the budget.
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });

    const queued = await this.mailQueue.enqueue({
      to: email,
      subject: 'Your ConnectPort verification code',
      headline: 'Confirm your email',
      body: `Hi ${payload.name},\n\nHere is a new code. It expires in 10 minutes.`,
      code,
    });

    const allowDevCode =
      !isProduction(this.config) &&
      (!this.mail.isConfigured() || !queued.queued);

    return {
      ok: true as const,
      email,
      expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
      emailDelivered: this.mail.isConfigured(),
      ...(allowDevCode ? { devCode: code } : {}),
    };
  }

  async verifySignupOtp(input: VerifySignupOtpDto) {
    const email = input.email.trim().toLowerCase();
    const code = input.code.trim();
    const pending = await this.prisma.emailOtp.findFirst({
      where: { email, purpose: SIGNUP_PURPOSE },
      orderBy: { createdAt: 'desc' },
    });
    if (!pending) {
      throw new BadRequestException(
        'No pending signup for this email. Start signup again.',
      );
    }
    if (pending.expiresAt.getTime() < Date.now()) {
      await this.prisma.emailOtp.delete({ where: { id: pending.id } });
      throw new BadRequestException('Code expired. Request a new one.');
    }
    if (pending.attempts >= OTP_MAX_ATTEMPTS) {
      await this.prisma.emailOtp.delete({ where: { id: pending.id } });
      throw new BadRequestException('Too many attempts. Start signup again.');
    }

    const expected = Buffer.from(pending.codeHash);
    const actual = Buffer.from(this.hashOtp(email, code));
    const ok =
      expected.length === actual.length &&
      timingSafeEqual(expected, actual);
    if (!ok) {
      await this.prisma.emailOtp.update({
        where: { id: pending.id },
        data: { attempts: pending.attempts + 1 },
      });
      throw new UnauthorizedException('Incorrect verification code.');
    }

    let payload: SignupPayload;
    try {
      payload = JSON.parse(pending.payloadJson) as SignupPayload;
    } catch {
      throw new BadRequestException('Signup session expired. Start again.');
    }

    const existing = await this.prisma.credential.findUnique({
      where: { email },
    });
    if (existing) {
      await this.prisma.emailOtp.deleteMany({
        where: { email, purpose: SIGNUP_PURPOSE },
      });
      throw new ConflictException('An account with this email already exists.');
    }

    const user = await this.prisma.user.create({
      data: {
        name: payload.name,
        email,
        phone: payload.phone,
        accountType: payload.accountType,
        credential: {
          create: {
            email,
            passwordHash: payload.passwordHash,
            kind: 'requester',
          },
        },
      },
    });

    await this.prisma.emailOtp.deleteMany({
      where: { email, purpose: SIGNUP_PURPOSE },
    });

    const tokens = await this.issueSessionTokens({
      sub: user.id,
      kind: 'requester',
      tv: 0,
    });

    void this.mailQueue.enqueue({
      to: user.email,
      subject: 'Welcome to ConnectPort',
      headline: `Hey ${user.name}`,
      body: 'Your account is ready. Tell us what you want, and we will source, quote, and ship it.',
      ctaLabel: 'Start a request',
      ctaPath: '/request',
    });

    return { ...tokens, user: serializeUser(user) };
  }

  async loginUnified(input: LoginDto) {
    const email = input.email.trim().toLowerCase();
    await this.assertLoginNotLocked(email);

    const credential = await this.prisma.credential.findUnique({
      where: { email },
      include: { user: true, opsUser: true },
    });

    // Always bcrypt-compare to reduce timing enumeration of registered emails.
    const hash = credential?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const passwordOk = await bcrypt.compare(input.password, hash);

    if (!credential || !passwordOk) {
      await this.recordLoginFailure(email);
      throw new UnauthorizedException('Incorrect email or password.');
    }

    if (credential.disabled) {
      throw new UnauthorizedException('This account has been disabled.');
    }

    await this.clearLoginFailures(email);

    if (credential.kind === 'ops' && credential.opsUser) {
      const opsUser = await this.prisma.opsUser.findUnique({
        where: { id: credential.opsUser.id },
        include: { roleRelation: true },
      });
      if (!opsUser) {
        throw new UnauthorizedException('Incorrect email or password.');
      }
      const serialized = serializeOpsUser(opsUser);
      const tokens = await this.issueSessionTokens({
        sub: opsUser.id,
        kind: 'ops',
        role: serialized.role,
        permissions: serialized.permissions,
        tv: credential.tokenVersion,
      });
      return {
        kind: 'ops' as const,
        ...tokens,
        opsUser: serialized,
      };
    }

    if (credential.kind === 'requester' && credential.user) {
      const tokens = await this.issueSessionTokens({
        sub: credential.user.id,
        kind: 'requester',
        tv: credential.tokenVersion,
      });
      return {
        kind: 'requester' as const,
        ...tokens,
        user: serializeUser(credential.user),
      };
    }

    throw new UnauthorizedException('Incorrect email or password.');
  }

  async loginOps(input: LoginDto) {
    const result = await this.loginUnified(input);
    if (result.kind !== 'ops') {
      throw new UnauthorizedException('Incorrect email or password.');
    }
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      opsUser: result.opsUser,
    };
  }

  /** Rotate access+refresh; reuse of an unknown refresh jti revokes the session. */
  async refreshSession(refreshToken: string) {
    let payload: AuthUser & { typ?: string; jti?: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Session expired. Sign in again.');
    }

    if (payload.typ !== 'refresh' || !payload.jti) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const key = `cp:refresh:${payload.jti}`;
    const stored = await this.redis.get(key);
    if (!stored) {
      await this.revokeSession(payload);
      throw new UnauthorizedException('Refresh token reuse detected.');
    }
    await this.redis.del(key);

    const where =
      payload.kind === 'ops'
        ? { opsUserId: payload.sub, kind: 'ops' as const }
        : { userId: payload.sub, kind: 'requester' as const };
    const credential = await this.prisma.credential.findFirst({
      where,
      include: {
        opsUser: { include: { roleRelation: true } },
        user: true,
      },
    });
    if (!credential || (payload.tv ?? 0) !== credential.tokenVersion) {
      throw new UnauthorizedException('Session revoked.');
    }

    let role: AuthUser['role'];
    let permissions: string[] | undefined;
    if (payload.kind === 'ops' && credential.opsUser) {
      const serialized = serializeOpsUser(credential.opsUser);
      role = serialized.role;
      permissions = serialized.permissions;
    }

    const authUser: AuthUser = {
      sub: payload.sub,
      kind: payload.kind,
      role,
      permissions,
      tv: credential.tokenVersion,
    };
    return this.issueSessionTokens(authUser);
  }

  getSession(authUser: AuthUser | null) {
    if (!authUser) {
      return null;
    }
    if (authUser.kind === 'requester') {
      return { kind: 'requester' as const, userId: authUser.sub };
    }
    return { kind: 'ops' as const, opsUserId: authUser.sub };
  }

  async getCurrentUser(authUser: AuthUser | null) {
    if (!authUser || authUser.kind !== 'requester') {
      return null;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: authUser.sub },
    });
    return user ? serializeUser(user) : null;
  }

  async getCurrentOpsUser(authUser: AuthUser | null) {
    if (!authUser || authUser.kind !== 'ops') {
      return null;
    }
    const opsUser = await this.prisma.opsUser.findUnique({
      where: { id: authUser.sub },
      include: { roleRelation: true },
    });
    return opsUser ? serializeOpsUser(opsUser) : null;
  }

  async completeOpsSetup(
    authUser: AuthUser,
    input: { name: string; password: string; phone?: string },
  ) {
    if (authUser.kind !== 'ops') {
      throw new UnauthorizedException('Ops login required.');
    }
    const name = input.name.trim();
    if (name.length < 2) {
      throw new BadRequestException('Add your full name.');
    }
    if (input.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters.');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    await this.prisma.$transaction(async (tx) => {
      await tx.opsUser.update({
        where: { id: authUser.sub },
        data: {
          name,
          phone: input.phone?.trim() || null,
          mustChangePassword: false,
          profileCompletedAt: new Date(),
        },
      });
      await tx.credential.update({
        where: { opsUserId: authUser.sub },
        data: {
          passwordHash,
          tokenVersion: { increment: 1 },
        },
      });
    });

    const opsUser = await this.prisma.opsUser.findUnique({
      where: { id: authUser.sub },
      include: { roleRelation: true, credential: true },
    });
    if (!opsUser?.credential) {
      throw new UnauthorizedException('Ops login required.');
    }
    const serialized = serializeOpsUser(opsUser);
    const tokens = await this.issueSessionTokens({
      sub: opsUser.id,
      kind: 'ops',
      role: serialized.role,
      permissions: serialized.permissions,
      tv: opsUser.credential.tokenVersion,
    });
    return { ...tokens, opsUser: serialized };
  }

  /** Start password reset: email OTP if account exists (response is always generic). */
  async startPasswordReset(input: ForgotPasswordDto) {
    this.assertMailReadyForOtp();
    const email = input.email.trim().toLowerCase();
    await this.assertOtpResendBudget(email);

    const credential = await this.prisma.credential.findUnique({
      where: { email },
      include: { user: true, opsUser: true },
    });

    // Always return the same shape so we do not leak registration.
    const base = {
      ok: true as const,
      email,
      expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
      emailDelivered: this.mail.isConfigured(),
    };

    if (!credential || credential.disabled) {
      return base;
    }

    const code = this.generateOtp();
    const name =
      credential.user?.name ?? credential.opsUser?.name ?? 'there';

    await this.prisma.emailOtp.deleteMany({
      where: { email, purpose: RESET_PURPOSE },
    });
    await this.prisma.emailOtp.create({
      data: {
        email,
        purpose: RESET_PURPOSE,
        codeHash: this.hashOtp(email, code),
        payloadJson: JSON.stringify({ credentialId: credential.id }),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });

    const queued = await this.mailQueue.enqueue({
      to: email,
      subject: 'Reset your ConnectPort password',
      headline: 'Password reset',
      body: `Hi ${name},\n\nEnter this code to choose a new password. It expires in 10 minutes. If you did not ask for this, you can ignore the email.`,
      code,
    });

    const allowDevCode =
      !isProduction(this.config) &&
      (!this.mail.isConfigured() || !queued.queued);

    return {
      ...base,
      ...(allowDevCode ? { devCode: code } : {}),
    };
  }

  async resetPassword(input: ResetPasswordDto) {
    const email = input.email.trim().toLowerCase();
    const code = input.code.trim();
    const pending = await this.prisma.emailOtp.findFirst({
      where: { email, purpose: RESET_PURPOSE },
      orderBy: { createdAt: 'desc' },
    });
    if (!pending) {
      throw new BadRequestException(
        'No pending reset for this email. Request a new code.',
      );
    }
    if (pending.expiresAt.getTime() < Date.now()) {
      await this.prisma.emailOtp.delete({ where: { id: pending.id } });
      throw new BadRequestException('Code expired. Request a new one.');
    }
    if (pending.attempts >= OTP_MAX_ATTEMPTS) {
      await this.prisma.emailOtp.delete({ where: { id: pending.id } });
      throw new BadRequestException('Too many attempts. Request a new code.');
    }

    const expected = Buffer.from(pending.codeHash);
    const actual = Buffer.from(this.hashOtp(email, code));
    const ok =
      expected.length === actual.length && timingSafeEqual(expected, actual);
    if (!ok) {
      await this.prisma.emailOtp.update({
        where: { id: pending.id },
        data: { attempts: pending.attempts + 1 },
      });
      throw new UnauthorizedException('Incorrect verification code.');
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const credential = await this.prisma.credential.findUnique({
      where: { email },
    });
    if (!credential || credential.disabled) {
      await this.prisma.emailOtp.delete({ where: { id: pending.id } });
      throw new BadRequestException('This account cannot be reset.');
    }

    await this.prisma.credential.update({
      where: { id: credential.id },
      data: {
        passwordHash,
        tokenVersion: { increment: 1 },
      },
    });
    await this.prisma.emailOtp.deleteMany({
      where: { email, purpose: RESET_PURPOSE },
    });
    await this.clearLoginFailures(email);

    return { ok: true as const };
  }

  /** Server-side logout: bump tokenVersion so existing JWTs fail validation. */
  async revokeSession(authUser: AuthUser) {
    await this.prisma.credential.updateMany({
      where:
        authUser.kind === 'ops'
          ? { opsUserId: authUser.sub }
          : { userId: authUser.sub },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  /** Delete expired OTP rows (call from ready/cron or boot). */
  async sweepExpiredOtps() {
    await this.prisma.emailOtp.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  }

  private async assertLoginNotLocked(email: string) {
    const key = `cp:login:fail:${email}`;
    const raw = await this.redis.get(key);
    const n = Number(raw ?? '0');
    if (n >= LOGIN_FAIL_MAX) {
      throw new UnauthorizedException(
        'Too many failed sign-in attempts. Try again in a few minutes.',
      );
    }
  }

  private async recordLoginFailure(email: string) {
    await this.redis.incr(`cp:login:fail:${email}`, LOGIN_FAIL_WINDOW_SEC);
  }

  private async clearLoginFailures(email: string) {
    await this.redis.del(`cp:login:fail:${email}`);
  }

  private assertMailReadyForOtp() {
    if (isProduction(this.config) && !this.mail.isConfigured()) {
      throw new ServiceUnavailableException(
        'Sign up is temporarily unavailable. Email delivery is not configured.',
      );
    }
  }

  private async assertOtpResendBudget(email: string) {
    const key = `cp:otp:budget:${email}`;
    const n = await this.redis.incr(key, OTP_RESEND_WINDOW_SEC);
    if (n > OTP_RESEND_MAX) {
      throw new BadRequestException(
        'Too many verification emails. Try again in a few minutes.',
      );
    }
  }

  private generateOtp() {
    return String(randomInt(100000, 1000000));
  }

  private hashOtp(email: string, code: string) {
    const pepper = this.config.getOrThrow<string>('JWT_SECRET');
    return createHash('sha256')
      .update(`${email}:${code}:${pepper}`)
      .digest('hex');
  }

  private async issueSessionTokens(payload: AuthUser) {
    const jti = randomUUID();
    const accessToken = await this.jwt.signAsync(
      { ...payload, typ: 'access' },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: (this.config.get<string>('JWT_EXPIRES_IN') ??
          '1h') as `${number}h`,
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { ...payload, typ: 'refresh', jti },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ??
          '7d') as `${number}d`,
      },
    );
    const refreshTtlSec = Math.floor(
      (() => {
        const raw = this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
        const match = /^(\d+)([smhd])$/i.exec(raw.trim());
        if (!match) return 7 * 86400;
        const n = Number(match[1]);
        const u = match[2]!.toLowerCase();
        return u === 's'
          ? n
          : u === 'm'
            ? n * 60
            : u === 'h'
              ? n * 3600
              : n * 86400;
      })(),
    );
    await this.redis.set(`cp:refresh:${jti}`, payload.sub, refreshTtlSec);
    return { accessToken, refreshToken };
  }

  private signToken(payload: AuthUser) {
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_SECRET'),
      expiresIn: (this.config.get<string>('JWT_EXPIRES_IN') ??
        '1h') as `${number}h`,
    });
  }
}
