/** Ops RBAC permission keys (v1). */
export const OPS_PERMISSIONS = [
  'queue.view',
  'queue.claim',
  'finds.submit',
  'finds.approve',
  'catalog.manage',
  'customers.view',
  'agents.invite',
  'roles.manage',
  'pricing.manage',
  'teams.manage',
  'activity.view',
] as const;

export type OpsPermission = (typeof OPS_PERMISSIONS)[number];

export const ALL_OPS_PERMISSIONS: OpsPermission[] = [...OPS_PERMISSIONS];

export const AGENT_DEFAULT_PERMISSIONS: OpsPermission[] = [
  'queue.view',
  'queue.claim',
  'finds.submit',
  'activity.view',
];

export function hasPermission(
  permissions: string[] | undefined,
  required: OpsPermission | OpsPermission[],
) {
  if (!permissions?.length) return false;
  const need = Array.isArray(required) ? required : [required];
  return need.every((p) => permissions.includes(p));
}

export function hasAnyPermission(
  permissions: string[] | undefined,
  required: OpsPermission[],
) {
  if (!permissions?.length) return false;
  return required.some((p) => permissions.includes(p));
}
