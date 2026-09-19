import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OPS_ADMIN_KEY } from '../decorators/auth.decorators';
import { AuthUser } from '../types/auth-user';

@Injectable()
export class OpsAdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(OPS_ADMIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (request.user?.kind !== 'ops') {
      throw new UnauthorizedException('Ops login required.');
    }
    if (request.user.role !== 'admin') {
      throw new ForbiddenException('Ops admin role required.');
    }
    return true;
  }
}
