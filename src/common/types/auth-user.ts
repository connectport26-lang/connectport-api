export type AuthKind = 'requester' | 'ops';
export type OpsRole = 'admin' | 'agent';

export type AuthUser = {
  sub: string;
  kind: AuthKind;
  role?: OpsRole;
};
