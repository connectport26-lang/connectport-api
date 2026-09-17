import { Decimal } from '@prisma/client/runtime/library';
import {
  Notification,
  OpsUser,
  Payment,
  Quote,
  Request,
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

export function serializeOpsUser(opsUser: OpsUser) {
  return {
    id: opsUser.id,
    name: opsUser.name,
    email: opsUser.email,
    role: opsUser.role,
  };
}

export function serializeRequest(request: Request) {
  const payload: {
    id: string;
    reference: string;
    userId: string;
    sourceType: Request['sourceType'];
    sourceValue: string;
    quantity: number;
    budgetMax: number;
    timeline: string;
    qualityNotes: string;
    flexibility: Request['flexibility'];
    status: Request['status'];
    assignedOpsUserId: string | null;
    marketplaceEligible?: boolean;
    createdAt: string;
  } = {
    id: request.id,
    reference: request.reference,
    userId: request.userId,
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

  if (request.marketplaceEligible != null) {
    payload.marketplaceEligible = request.marketplaceEligible;
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
  request: Request;
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
