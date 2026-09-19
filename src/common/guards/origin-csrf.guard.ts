import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/auth.decorators';
import { ACCESS_COOKIE } from '../../auth/auth-cookies';
import { isProduction } from '../prod-guard';

/**
 * CSRF defense for cookie sessions: mutating requests that send the
 * access cookie must present an Origin/Referer on the CORS allowlist.
 * Bearer-only native clients (Authorization header, no cookie) skip this.
 */
@Injectable()
export class OriginCsrfGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const method = (req.method || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Public webhooks (Paystack) have no browser Origin from our SPA
    if (
      isPublic &&
      (req.originalUrl?.includes('/webhooks/') ||
        req.url?.includes('/webhooks/'))
    ) {
      return true;
    }

    const cookies = (
      req as Request & { cookies?: Record<string, string> }
    ).cookies;
    const hasCookie = Boolean(cookies?.[ACCESS_COOKIE]);
    const hasBearer = Boolean(req.headers.authorization?.startsWith('Bearer '));

    // Bearer-only (no cookie): not a browser cookie CSRF vector
    if (hasBearer && !hasCookie) {
      return true;
    }

    // Unauthenticated public POSTs (login/signup) still need Origin in prod
    // to block cross-site form posts when cookies might later be set.
    if (!hasCookie && !hasBearer && isPublic) {
      if (!isProduction(this.config)) return true;
      return this.assertOriginAllowed(req);
    }

    if (!hasCookie) {
      return true;
    }

    return this.assertOriginAllowed(req);
  }

  private assertOriginAllowed(req: Request): boolean {
    const allowed = (this.config.get<string>('CORS_ORIGIN') ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);

    const origin = req.headers.origin;
    if (origin && allowed.includes(origin)) {
      return true;
    }

    const referer = req.headers.referer;
    if (referer) {
      try {
        const refOrigin = new URL(referer).origin;
        if (allowed.includes(refOrigin)) return true;
      } catch {
        /* ignore */
      }
    }

    // Dev: allow localhost tools without Origin
    if (!isProduction(this.config) && !origin) {
      return true;
    }

    throw new ForbiddenException('Invalid request origin.');
  }
}
