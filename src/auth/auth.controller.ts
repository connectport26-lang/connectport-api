import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CaptchaService } from './captcha.service';
import {
  LoginDto,
  ResendSignupOtpDto,
  SignupDto,
  VerifySignupOtpDto,
} from './dto/auth.dto';
import { OptionalAuth, Public } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import {
  clearAccessCookie,
  REFRESH_COOKIE,
  setSessionCookies,
} from './auth-cookies';
import { RedisService } from '../redis/redis.module';

function stripTokensForBrowser<
  T extends { accessToken?: string; refreshToken?: string },
>(result: T, clientHeader?: string): Omit<T, 'accessToken' | 'refreshToken'> | T {
  if (clientHeader?.toLowerCase() === 'native') {
    return result;
  }
  const { accessToken: _a, refreshToken: _r, ...rest } = result;
  return rest;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly captcha: CaptchaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('signup')
  async startSignup(
    @Body() body: SignupDto,
    @Req() req: Request,
  ) {
    await this.maybeRequireCaptcha(body.email, body.captchaToken, req);
    return this.auth.startSignup(body);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('signup/verify')
  async verifySignup(
    @Body() body: VerifySignupOtpDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-client') client?: string,
  ) {
    const result = await this.auth.verifySignupOtp(body);
    setSessionCookies(res, result.accessToken, result.refreshToken, this.config);
    return stripTokensForBrowser(result, client);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('signup/resend')
  resendSignup(@Body() body: ResendSignupOtpDto) {
    return this.auth.resendSignupOtp(body);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
    @Headers('x-client') client?: string,
  ) {
    await this.maybeRequireCaptcha(body.email, body.captchaToken, req);
    const result = await this.auth.loginUnified(body);
    setSessionCookies(res, result.accessToken, result.refreshToken, this.config);
    return stripTokensForBrowser(result, client);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('ops/login')
  async loginOps(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
    @Headers('x-client') client?: string,
  ) {
    await this.maybeRequireCaptcha(body.email, body.captchaToken, req);
    const result = await this.auth.loginOps(body);
    setSessionCookies(res, result.accessToken, result.refreshToken, this.config);
    return stripTokensForBrowser(result, client);
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-client') client?: string,
  ) {
    const token =
      (req as Request & { cookies?: Record<string, string> }).cookies?.[
        REFRESH_COOKIE
      ] ?? undefined;
    if (!token) {
      clearAccessCookie(res, this.config);
      return { ok: false };
    }
    const tokens = await this.auth.refreshSession(token);
    setSessionCookies(res, tokens.accessToken, tokens.refreshToken, this.config);
    return stripTokensForBrowser(tokens, client);
  }

  @OptionalAuth()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentUser() user: AuthUser | null,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (user) {
      await this.auth.revokeSession(user);
    }
    clearAccessCookie(res, this.config);
  }

  @OptionalAuth()
  @Get('session')
  getSession(@CurrentUser() user: AuthUser | null, @Res() res: Response) {
    res.status(200).json(this.auth.getSession(user));
  }

  @OptionalAuth()
  @Get('me')
  async getMe(@CurrentUser() user: AuthUser | null, @Res() res: Response) {
    res.status(200).json(await this.auth.getCurrentUser(user));
  }

  @OptionalAuth()
  @Get('ops/me')
  async getOpsMe(@CurrentUser() user: AuthUser | null, @Res() res: Response) {
    res.status(200).json(await this.auth.getCurrentOpsUser(user));
  }

  private async maybeRequireCaptcha(
    email: string,
    captchaToken: string | undefined,
    req: Request,
  ) {
    if (!this.captcha.isEnabled()) return;
    const key = `cp:login:fail:${email.trim().toLowerCase()}`;
    const fails = Number((await this.redis.get(key)) ?? '0');
    if (fails < 3) return;
    const ip =
      (req.headers['cf-connecting-ip'] as string | undefined) ||
      req.ip ||
      undefined;
    await this.captcha.assertValid(captchaToken, ip);
  }
}
