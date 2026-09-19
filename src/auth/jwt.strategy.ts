import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { ACCESS_COOKIE } from './auth-cookies';
import { ALL_OPS_PERMISSIONS, AGENT_DEFAULT_PERMISSIONS } from '../common/permissions';

type JwtPayload = {
  sub: string;
  kind: 'requester' | 'ops';
  role?: string;
  permissions?: string[];
  tv?: number;
  typ?: string;
};

function cookieExtractor(req: Request): string | null {
  const value = req?.cookies?.[ACCESS_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (payload.typ === 'refresh') {
      throw new UnauthorizedException();
    }
    if (payload.kind === 'ops') {
      const credential = await this.prisma.credential.findFirst({
        where: { opsUserId: payload.sub, kind: 'ops' },
        include: { opsUser: { include: { roleRelation: true } } },
      });
      if (!credential?.opsUser) {
        throw new UnauthorizedException();
      }
      if (credential.disabled) {
        throw new UnauthorizedException('This account has been disabled.');
      }
      if ((payload.tv ?? 0) !== credential.tokenVersion) {
        throw new UnauthorizedException('Session revoked.');
      }
      const slug =
        credential.opsUser.roleRelation?.slug ?? credential.opsUser.role;
      const permissions =
        credential.opsUser.roleRelation?.permissions ??
        (slug === 'admin' ? [...ALL_OPS_PERMISSIONS] : [...AGENT_DEFAULT_PERMISSIONS]);
      return {
        sub: payload.sub,
        kind: 'ops',
        role: slug === 'admin' ? 'admin' : slug === 'agent' ? 'agent' : slug,
        permissions,
        mustChangePassword: credential.opsUser.mustChangePassword,
      };
    }

    const credential = await this.prisma.credential.findFirst({
      where: { userId: payload.sub, kind: 'requester' },
    });
    if (!credential) {
      throw new UnauthorizedException();
    }
    if ((payload.tv ?? 0) !== credential.tokenVersion) {
      throw new UnauthorizedException('Session revoked.');
    }
    return {
      sub: payload.sub,
      kind: 'requester',
    };
  }
}
