export type AuthKind = 'requester' | 'ops';
/** Legacy slug for JWT/UI: system role slug or 'admin'/'agent'. */
export type OpsRole = 'admin' | 'agent' | string;

export type AuthUser = {
  sub: string;
  kind: AuthKind;
  role?: OpsRole;
  permissions?: string[];
  mustChangePassword?: boolean;
  /** Credential tokenVersion at issue time; used for server-side revoke. */
  tv?: number;
};
