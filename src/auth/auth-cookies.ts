import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { isProduction } from '../common/prod-guard';

export const ACCESS_COOKIE = 'cp_access';
export const REFRESH_COOKIE = 'cp_refresh';

/** Parse JWT_EXPIRES_IN (e.g. 1h, 15m, 7d) to cookie maxAge ms. */
export function jwtExpiresToMs(raw: string | undefined): number {
  const value = (raw ?? '1h').trim();
  const match = /^(\d+)([smhd])$/i.exec(value);
  if (!match) return 60 * 60 * 1000;
  const n = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  const mult =
    unit === 's'
      ? 1000
      : unit === 'm'
        ? 60_000
        : unit === 'h'
          ? 3_600_000
          : 86_400_000;
  return n * mult;
}

export function setSessionCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  config: ConfigService,
) {
  const prod = isProduction(config);
  const accessMaxAge = jwtExpiresToMs(config.get<string>('JWT_EXPIRES_IN'));
  const refreshMaxAge = jwtExpiresToMs(
    config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
  );

  res.cookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure: prod,
    sameSite: prod ? 'none' : 'lax',
    path: '/',
    maxAge: accessMaxAge,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: prod,
    sameSite: prod ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: refreshMaxAge,
  });
}

export function setAccessCookie(
  res: Response,
  token: string,
  config: ConfigService,
) {
  const prod = isProduction(config);
  const maxAge = jwtExpiresToMs(config.get<string>('JWT_EXPIRES_IN'));
  res.cookie(ACCESS_COOKIE, token, {
    httpOnly: true,
    secure: prod,
    sameSite: prod ? 'none' : 'lax',
    path: '/',
    maxAge,
  });
}

export function clearAccessCookie(res: Response, config: ConfigService) {
  const prod = isProduction(config);
  res.clearCookie(ACCESS_COOKIE, {
    httpOnly: true,
    secure: prod,
    sameSite: prod ? 'none' : 'lax',
    path: '/',
  });
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: prod,
    sameSite: prod ? 'none' : 'lax',
    path: '/api/auth',
  });
}
