import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { serializeOpsUser, serializeUser } from '../common/serializers';
import { AuthUser } from '../common/types/auth-user';
import { LoginDto, SignupDto } from './dto/auth.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async signupRequester(input: SignupDto) {
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.credential.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        name: input.name.trim(),
        email,
        phone: input.phone.trim(),
        accountType: input.accountType,
        credential: {
          create: {
            email,
            passwordHash,
            kind: 'requester',
          },
        },
      },
    });

    const accessToken = await this.signToken({
      sub: user.id,
      kind: 'requester',
    });

    return { accessToken, user: serializeUser(user) };
  }

  async loginRequester(input: LoginDto) {
    const email = input.email.trim().toLowerCase();
    const credential = await this.prisma.credential.findUnique({
      where: { email },
      include: { user: true },
    });

    if (
      !credential ||
      credential.kind !== 'requester' ||
      !credential.user ||
      !(await bcrypt.compare(input.password, credential.passwordHash))
    ) {
      throw new UnauthorizedException('Incorrect email or password.');
    }

    const accessToken = await this.signToken({
      sub: credential.user.id,
      kind: 'requester',
    });

    return { accessToken, user: serializeUser(credential.user) };
  }

  async loginOps(input: LoginDto) {
    const email = input.email.trim().toLowerCase();
    const credential = await this.prisma.credential.findUnique({
      where: { email },
      include: { opsUser: true },
    });

    if (
      !credential ||
      credential.kind !== 'ops' ||
      !credential.opsUser ||
      !(await bcrypt.compare(input.password, credential.passwordHash))
    ) {
      throw new UnauthorizedException('Incorrect email or password.');
    }

    const accessToken = await this.signToken({
      sub: credential.opsUser.id,
      kind: 'ops',
      role: credential.opsUser.role,
    });

    return { accessToken, opsUser: serializeOpsUser(credential.opsUser) };
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
    });
    return opsUser ? serializeOpsUser(opsUser) : null;
  }

  private signToken(payload: AuthUser) {
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_SECRET'),
      expiresIn: (this.config.get<string>('JWT_EXPIRES_IN') ??
        '7d') as `${number}d`,
    });
  }
}
