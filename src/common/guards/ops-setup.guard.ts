import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthUser } from '../types/auth-user';

/**
 * Blocks ops mutations until invitees finish /auth/ops/complete-setup.
 * Allows session/me and the setup endpoint itself.
 */
@Injectable()
export class OpsSetupGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: AuthUser;
      method?: string;
      url?: string;
      path?: string;
      route?: { path?: string };
    }>();
    const user = request.user;
    if (user?.kind !== 'ops' || !user.mustChangePassword) {
      return true;
    }

    const method = (request.method || 'GET').toUpperCase();
    const path = `${request.url || request.path || ''}`.split('?')[0];
    const allowed =
      method === 'GET' ||
      path.endsWith('/auth/ops/complete-setup') ||
      path.includes('/auth/logout') ||
      path.includes('/auth/refresh');

    if (allowed) return true;

    throw new ForbiddenException(
      'Finish setting up your password and name before using the ops console.',
    );
  }
}
