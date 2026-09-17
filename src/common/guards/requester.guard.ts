import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUESTER_KIND_KEY } from '../decorators/auth.decorators';
import { AuthUser } from '../types/auth-user';

@Injectable()
export class RequesterGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(
      REQUESTER_KIND_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (request.user?.kind !== 'requester') {
      throw new UnauthorizedException('Please log in to continue.');
    }
    return true;
  }
}
