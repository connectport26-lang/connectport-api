import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const IS_OPTIONAL_AUTH_KEY = 'isOptionalAuth';
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);

export const REQUESTER_KIND_KEY = 'requesterKind';
export const RequireRequester = () => SetMetadata(REQUESTER_KIND_KEY, true);

export const OPS_KIND_KEY = 'opsKind';
export const RequireOps = () => SetMetadata(OPS_KIND_KEY, true);
