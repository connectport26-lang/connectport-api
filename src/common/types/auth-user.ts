export type AuthKind = 'requester' | 'ops';
export type OpsRole = 'admin' | 'agent';

export type AuthUser = {
  sub: string;
  kind: AuthKind;
  role?: OpsRole;
  /** Credential tokenVersion at issue time; used for server-side revoke. */
  tv?: number;
};
