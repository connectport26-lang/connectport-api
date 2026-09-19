import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  OPS_ADMIN_KEY,
  OPS_PERMISSION_KEY,
} from '../decorators/auth.decorators';
import { AuthUser } from '../types/auth-user';
import {
  hasAnyPermission,
  hasPermission,
  type OpsPermission,
} from '../permissions';

@Injectable()
export class OpsAdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredAdmin = this.reflector.getAllAndOverride<boolean>(
      OPS_ADMIN_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredPerms = this.reflector.getAllAndOverride<OpsPermission[]>(
      OPS_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredAdmin && !requiredPerms?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (request.user?.kind !== 'ops') {
      throw new UnauthorizedException('Ops login required.');
    }

    if (requiredPerms?.length) {
      const ok =
        requiredPerms.length === 1
          ? hasPermission(request.user.permissions, requiredPerms[0])
          : hasAnyPermission(request.user.permissions, requiredPerms);
      if (!ok) {
        throw new ForbiddenException('You do not have permission for this action.');
      }
      return true;
    }

    // Legacy admin gate: admin role or any manage permission
    const isAdmin =
      request.user.role === 'admin' ||
      hasPermission(request.user.permissions, 'roles.manage') ||
      hasPermission(request.user.permissions, 'agents.invite');
    if (!isAdmin) {
      throw new ForbiddenException('Ops admin role required.');
    }
    return true;
  }
}
