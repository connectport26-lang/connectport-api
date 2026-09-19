import { Decimal } from '@prisma/client/runtime/library';
import {
  Notification,
  OpsUser,
  Payment,
  Quote,
  Request,
  RequestReference,
  StatusUpdate,
  User,
} from '@prisma/client';

export type RequestDetailJson = {
  request: ReturnType<typeof serializeRequest>;
  user: ReturnType<typeof serializeUser>;
  quotes: ReturnType<typeof serializeQuote>[];
  payment: ReturnType<typeof serializePayment> | null;
  history: ReturnType<typeof serializeStatusUpdate>[];
  notifications: ReturnType<typeof serializeNotification>[];
  assignedOpsUser: ReturnType<typeof serializeOpsUser> | null;
};

function money(value: Decimal | number | string): number {
  return Number(value);
}

export function serializeUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    accountType: user.accountType,
    createdAt: user.createdAt.toISOString(),
  };
}

export function serializeOpsUser(
  opsUser: OpsUser & {
    roleRelation?: {
      id: string;
      name: string;
      slug: string;
      permissions: string[];
    } | null;
  },
) {
  const slug = opsUser.roleRelation?.slug ?? opsUser.role;
  const permissions =
    opsUser.roleRelation?.permissions ??
    (opsUser.role === 'admin'
      ? [
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
        ]
      : ['queue.view', 'queue.claim', 'finds.submit', 'activity.view']);

  return {
    id: opsUser.id,
    name: opsUser.name ?? '',
    email: opsUser.email,
    phone: opsUser.phone ?? null,
    role: slug === 'admin' ? ('admin' as const) : ('agent' as const),
    roleId: opsUser.roleId ?? null,
    roleSlug: slug,
    roleName: opsUser.roleRelation?.name ?? slug,
    permissions,
    mustChangePassword: opsUser.mustChangePassword,
    profileComplete: Boolean(opsUser.profileCompletedAt && opsUser.name),
  };
}

export function serializeRequest(request: Request & { references?: RequestReference[] }) {
  const payload: {
    id: string;
    reference: string;
    userId: string;
    channel: Request['channel'];
    sourceType: Request['sourceType'];
    sourceValue: string;
    quantity: number;
    budgetMax: number;
    timeline: string;
    qualityNotes: string;
    flexibility: Request['flexibility'];
    status: Request['status'];
    cancelReason?: Request['cancelReason'];
    cancelNote?: string | null;
    assignedOpsUserId: string | null;
    marketplaceEligible?: boolean;
    createdAt: string;
    productName?: string | null;
    productDescription?: string | null;
    budgetScope?: Request['budgetScope'];
    needByKind?: Request['needByKind'];
    needByDate?: string | null;
    needByTimeframe?: string | null;
    references?: Array<{ id: string; kind: RequestReference['kind']; value: string; createdAt: string }>;
  } = {
    id: request.id,
    reference: request.reference,
    userId: request.userId,
    channel: request.channel,
    sourceType: request.sourceType,
    sourceValue: request.sourceValue,
    quantity: request.quantity,
    budgetMax: money(request.budgetMax),
    timeline: request.timeline,
    qualityNotes: request.qualityNotes,
    flexibility: request.flexibility,
    status: request.status,
    assignedOpsUserId: request.assignedOpsUserId,
    createdAt: request.createdAt.toISOString(),
  };

  if (request.cancelReason != null) {
    payload.cancelReason = request.cancelReason;
  }
  if (request.cancelNote != null) {
    payload.cancelNote = request.cancelNote;
  }
  if (request.marketplaceEligible != null) {
    payload.marketplaceEligible = request.marketplaceEligible;
  }
  if (request.productName != null) {
    payload.productName = request.productName;
  }
  if (request.productDescription != null) {
    payload.productDescription = request.productDescription;
  }
  if (request.budgetScope != null) {
    payload.budgetScope = request.budgetScope;
  }
  if (request.needByKind != null) {
    payload.needByKind = request.needByKind;
  }
  if (request.needByDate != null) {
    payload.needByDate = request.needByDate.toISOString();
  }
  if (request.needByTimeframe != null) {
    payload.needByTimeframe = request.needByTimeframe;
  }
  if (request.references != null) {
    payload.references = request.references.map((item) => ({
      id: item.id,
      kind: item.kind,
      value: item.value,
      createdAt: item.createdAt.toISOString(),
    }));
  }

  return payload;
}

export function serializeQuote(quote: Quote) {
  return {
    id: quote.id,
    requestId: quote.requestId,
    agentId: quote.agentId,
    supplierRef: quote.supplierRef,
    unitPrice: money(quote.unitPrice),
    moq: quote.moq,
    productCost: money(quote.productCost),
    freightEstimate: money(quote.freightEstimate),
    serviceFee: money(quote.serviceFee),
    totalCost: money(quote.totalCost),
    leadTime: quote.leadTime,
    isAlternative: quote.isAlternative,
    status: quote.status,
    createdAt: quote.createdAt.toISOString(),
  };
}

export function serializePayment(payment: Payment) {
  return {
    id: payment.id,
    requestId: payment.requestId,
    amount: money(payment.amount),
    gateway: payment.gateway,
    gatewayRef: payment.gatewayRef,
    status: payment.status,
    paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
    refundRef: payment.refundRef ?? null,
    refundedAt: payment.refundedAt ? payment.refundedAt.toISOString() : null,
  };
}

export function serializeStatusUpdate(entry: StatusUpdate) {
  return {
    id: entry.id,
    requestId: entry.requestId,
    status: entry.status,
    note: entry.note,
    updatedBy: entry.updatedBy,
    createdAt: entry.createdAt.toISOString(),
  };
}

export function serializeNotification(notification: Notification) {
  return {
    id: notification.id,
    requestId: notification.requestId,
    channel: notification.channel,
    message: notification.message,
    createdAt: notification.createdAt.toISOString(),
  };
}

export function serializeRequestDetail(input: {
  request: Request & { references?: RequestReference[] };
  user: User;
  quotes: Quote[];
  payment: Payment | null;
  history: StatusUpdate[];
  notifications: Notification[];
  assignedOpsUser: OpsUser | null;
}): RequestDetailJson {
  return {
    request: serializeRequest(input.request),
    user: serializeUser(input.user),
    quotes: input.quotes.map(serializeQuote),
    payment: input.payment ? serializePayment(input.payment) : null,
    history: [...input.history]
      .sort((a, b) =>
        a.createdAt.toISOString().localeCompare(b.createdAt.toISOString()),
      )
      .map(serializeStatusUpdate),
    notifications: [...input.notifications]
      .sort((a, b) =>
        b.createdAt.toISOString().localeCompare(a.createdAt.toISOString()),
      )
      .map(serializeNotification),
    assignedOpsUser: input.assignedOpsUser
      ? serializeOpsUser(input.assignedOpsUser)
      : null,
  };
}
