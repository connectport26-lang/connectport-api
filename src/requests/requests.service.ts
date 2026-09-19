import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationChannel,
  Prisma,
  RequestStatus,
  User,
} from '@prisma/client';
import {
  ACCOUNT_CAPS,
  CANCEL_REASON_LABELS,
  REQUESTER_STATUS_LABELS,
} from '../common/constants';
import { calculateQuoteBreakdown } from '../common/pricing';
import {
  serializeRequest,
  serializeRequestDetail,
} from '../common/serializers';
import { isProduction } from '../common/prod-guard';
import { MailQueueService } from '../queue/queue.module';
import { buildRequestEmailContext } from '../mail/mail.context';
import { buildReceiptPdfBase64 } from '../mail/receipt-pdf';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../common/audit.service';
import {
  CreateRequestDto,
  CreateGuidedRequestDto,
  CreateCatalogOrderDto,
  QuoteDraftDto,
  RequestFiltersDto,
  UpdateStatusDto,
  CancelRequestDto,
} from './dto/requests.dto';

/** Ops may only advance along this chain after payment. */
const OPS_STATUS_ORDER: RequestStatus[] = [
  'submitted',
  'quoted',
  'approved_paid',
  'procured',
  'in_transit_china_warehouse',
  'in_transit_freight',
  'arrived_nigeria_warehouse',
  'delivered',
];

const POST_PAYMENT: RequestStatus[] = [
  'procured',
  'in_transit_china_warehouse',
  'in_transit_freight',
  'arrived_nigeria_warehouse',
  'delivered',
];

const DETAIL_INCLUDE = {
  user: true,
  assignedOpsUser: true,
  quotes: true,
  payment: true,
  history: { orderBy: { createdAt: 'asc' as const } },
  notifications: { orderBy: { createdAt: 'desc' as const } },
  references: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.RequestInclude;

const SUMMARY_INCLUDE = {
  user: true,
  assignedOpsUser: true,
  quotes: true,
  payment: true,
  history: { orderBy: { createdAt: 'desc' as const }, take: 1 },
  notifications: { orderBy: { createdAt: 'desc' as const }, take: 3 },
  references: { orderBy: { createdAt: 'asc' as const }, take: 5 },
} satisfies Prisma.RequestInclude;

type RequestWithDetail = Prisma.RequestGetPayload<{
  include: typeof DETAIL_INCLUDE;
}>;

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailQueue: MailQueueService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async listMyRequests(userId: string, limit = 50) {
    const take = Math.min(Math.max(limit, 1), 100);
    const requests = await this.prisma.request.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
      include: SUMMARY_INCLUDE,
    });
    return requests.map((request) =>
      this.toDetail(request as unknown as RequestWithDetail),
    );
  }

  async getMyRequest(userId: string, id: string) {
    const request = await this.loadDetail(id);
    if (!request || request.userId !== userId) {
      throw new NotFoundException('Request not found.');
    }
    return this.toDetail(request);
  }

  async createRequest(userId: string, input: CreateRequestDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Account not found.');
    }
    this.assertCaps(user, input);

    const reference = await this.nextReference();
    const created = await this.prisma.$transaction(async (tx) => {
      const request = await tx.request.create({
        data: {
          reference,
          userId: user.id,
          channel: 'sourcing',
          sourceType: input.sourceType,
          sourceValue: input.sourceValue,
          quantity: input.quantity,
          budgetMax: input.budgetMax,
          timeline: input.timeline,
          qualityNotes: input.qualityNotes,
          flexibility: input.flexibility,
          status: 'submitted',
        },
      });

      await tx.statusUpdate.create({
        data: {
          requestId: request.id,
          status: 'submitted',
          note: 'Request received.',
          updatedBy: 'system',
        },
      });

      await tx.notification.create({
        data: this.notificationData(
          request.reference,
          request.id,
          user,
          'submitted',
        ),
      });

      return request;
    });

    return serializeRequest(created);
  }

  async createGuidedRequest(userId: string, input: CreateGuidedRequestDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Account not found.');
    this.assertCaps(user, input);
    if (input.needByKind === 'specific_date' && !input.needByDate) {
      throw new BadRequestException('Choose the date you need this by.');
    }
    if (input.needByKind === 'timeframe' && !input.needByTimeframe?.trim()) {
      throw new BadRequestException('Tell us the timeframe you need this by.');
    }

    let preferredProduct: {
      id: string;
      unitPrice: { toString(): string } | number;
      weightKg: { toString(): string } | number;
      moq: number;
      estimatedDeliveryDays: number;
      status: string;
      name: string;
    } | null = null;

    if (input.preferredProductId?.trim()) {
      preferredProduct = await this.prisma.product.findUnique({
        where: { id: input.preferredProductId.trim() },
      });
      if (!preferredProduct || preferredProduct.status !== 'published') {
        throw new BadRequestException('Preferred product is not available.');
      }
      const unitPrice = Number(preferredProduct.unitPrice);
      const withinBudget =
        input.budgetScope === 'per_unit'
          ? unitPrice <= input.budgetMax
          : calculateQuoteBreakdown({
              unitPrice,
              quantity: input.quantity,
              weightKgPerUnit: Number(preferredProduct.weightKg),
            }).totalCost <= input.budgetMax;
      if (!withinBudget) {
        preferredProduct = null;
      }
    }

    const link = input.references.find((item) => item.kind === 'link');
    const image = input.references.find((item) => item.kind === 'image');
    const sourceValue =
      link?.value ??
      image?.value ??
      input.productDescription?.trim() ??
      input.productName;
    const reference = await this.nextReference();

    const agent =
      (await this.prisma.opsUser.findFirst({
        where: { role: 'admin' },
        orderBy: { email: 'asc' },
      })) ??
      (await this.prisma.opsUser.findFirst({ orderBy: { email: 'asc' } }));

    const createdId = await this.prisma.$transaction(async (tx) => {
      const request = await tx.request.create({
        data: {
          reference,
          userId: user.id,
          channel: 'sourcing',
          sourceType: link ? 'link' : image ? 'photo' : 'text',
          sourceValue,
          quantity: input.quantity,
          budgetMax: input.budgetMax,
          timeline:
            input.needByKind === 'flexible'
              ? "I'm flexible"
              : input.needByKind === 'specific_date'
                ? input.needByDate!
                : input.needByTimeframe!,
          qualityNotes: input.qualityNotes?.trim() ?? '',
          flexibility: input.flexibility,
          productName: input.productName.trim(),
          productDescription: input.productDescription?.trim() || null,
          budgetScope: input.budgetScope,
          needByKind: input.needByKind,
          needByDate: input.needByDate ? new Date(input.needByDate) : null,
          needByTimeframe: input.needByTimeframe?.trim() || null,
          references: {
            create: input.references.map((item) => ({
              kind: item.kind,
              value: item.value.trim(),
            })),
          },
        },
        include: { references: true },
      });

      await tx.statusUpdate.create({
        data: {
          requestId: request.id,
          status: 'submitted',
          note: 'Request received.',
          updatedBy: 'system',
        },
      });
      await tx.notification.create({
        data: this.notificationData(
          request.reference,
          request.id,
          user,
          'submitted',
        ),
      });

      if (preferredProduct && agent) {
        const breakdown = calculateQuoteBreakdown({
          unitPrice: Number(preferredProduct.unitPrice),
          quantity: input.quantity,
          weightKgPerUnit: Number(preferredProduct.weightKg),
        });

        await tx.quote.create({
          data: {
            requestId: request.id,
            agentId: agent.id,
            supplierRef: preferredProduct.id,
            unitPrice: breakdown.unitPrice,
            moq: preferredProduct.moq,
            productCost: breakdown.productCost,
            freightEstimate: breakdown.freightEstimate,
            serviceFee: breakdown.serviceFee,
            totalCost: breakdown.totalCost,
            leadTime: `~${preferredProduct.estimatedDeliveryDays} days`,
            isAlternative: false,
            status: 'sent',
          },
        });

        await tx.request.update({
          where: { id: request.id },
          data: {
            status: 'quoted',
            assignedOpsUserId: agent.id,
          },
        });

        await tx.statusUpdate.create({
          data: {
            requestId: request.id,
            status: 'quoted',
            note: `Auto-quote from catalog: ${preferredProduct.name}.`,
            updatedBy: 'system',
          },
        });

        await tx.notification.create({
          data: this.notificationData(
            request.reference,
            request.id,
            user,
            'quoted',
          ),
        });
      }

      return request.id;
    });

    const detail = this.toDetail(await this.requireDetail(createdId));
    await this.emailStatusNotice(
      user,
      detail.request,
      detail.request.status,
    );
    return detail;
  }

  /** Direct catalog purchase: skip sourcing chat, land on a payable quote. */
  async createCatalogOrder(userId: string, input: CreateCatalogOrderDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const product = await this.prisma.product.findUnique({
      where: { id: input.productId.trim() },
    });
    if (!product || product.status !== 'published') {
      throw new NotFoundException('Product not found.');
    }
    if (input.quantity < product.moq) {
      throw new BadRequestException(
        `Minimum order is ${product.moq} units for this product.`,
      );
    }

    const breakdown = calculateQuoteBreakdown({
      unitPrice: Number(product.unitPrice),
      quantity: input.quantity,
      weightKgPerUnit: Number(product.weightKg),
    });

    this.assertCaps(user, {
      quantity: input.quantity,
      budgetMax: breakdown.totalCost,
      budgetScope: 'total',
    });

    const agent =
      (await this.prisma.opsUser.findFirst({
        where: { role: 'admin' },
        orderBy: { email: 'asc' },
      })) ??
      (await this.prisma.opsUser.findFirst({ orderBy: { email: 'asc' } }));

    if (!agent) {
      throw new BadRequestException(
        'No ops agent is available to take this order yet.',
      );
    }

    const reference = await this.nextReference();

    const createdId = await this.prisma.$transaction(async (tx) => {
      const request = await tx.request.create({
        data: {
          reference,
          userId: user.id,
          channel: 'catalog',
          sourceType: 'text',
          sourceValue: product.name,
          quantity: input.quantity,
          budgetMax: breakdown.totalCost,
          timeline: `~${product.estimatedDeliveryDays} days`,
          qualityNotes: '',
          flexibility: 'exact',
          productName: product.name,
          productDescription: product.description,
          budgetScope: 'total',
          needByKind: 'flexible',
          needByTimeframe: `~${product.estimatedDeliveryDays} days`,
          status: 'quoted',
          assignedOpsUserId: agent.id,
          references: {
            create: [
              {
                kind: 'image',
                value: product.imageUrl,
              },
            ],
          },
        },
      });

      await tx.quote.create({
        data: {
          requestId: request.id,
          agentId: agent.id,
          supplierRef: product.id,
          unitPrice: breakdown.unitPrice,
          moq: product.moq,
          productCost: breakdown.productCost,
          freightEstimate: breakdown.freightEstimate,
          serviceFee: breakdown.serviceFee,
          totalCost: breakdown.totalCost,
          leadTime: `~${product.estimatedDeliveryDays} days`,
          isAlternative: false,
          status: 'sent',
        },
      });

      await tx.statusUpdate.create({
        data: {
          requestId: request.id,
          status: 'quoted',
          note: `Catalog order: ${product.name}.`,
          updatedBy: 'system',
        },
      });

      await tx.notification.create({
        data: this.notificationData(
          request.reference,
          request.id,
          user,
          'quoted',
        ),
      });

      return request.id;
    });

    const detail = this.toDetail(await this.requireDetail(createdId));
    await this.emailStatusNotice(user, detail.request, 'quoted');
    return detail;
  }

  async rejectQuote(userId: string, requestId: string, quoteId: string) {
    return this.prisma.$transaction(async (tx) => {
      const request = await this.loadDetail(requestId, tx);
      if (!request || request.userId !== userId) {
        throw new NotFoundException('Request not found.');
      }
      if (request.status !== 'quoted') {
        throw new BadRequestException('This quote can no longer be rejected.');
      }

      const quote = request.quotes.find((item) => item.id === quoteId);
      if (!quote) {
        throw new NotFoundException('Quote not found.');
      }

      await tx.quote.update({
        where: { id: quoteId },
        data: { status: 'rejected' },
      });

      return this.toDetail(await this.requireDetail(requestId, tx));
    });
  }

  async approveQuote(userId: string, requestId: string, quoteId: string) {
    return this.prisma.$transaction(async (tx) => {
      const request = await this.loadDetail(requestId, tx);
      if (!request || request.userId !== userId) {
        throw new NotFoundException('Request not found.');
      }
      if (request.status !== 'quoted') {
        throw new BadRequestException('This quote can no longer be approved.');
      }

      const quote = request.quotes.find((item) => item.id === quoteId);
      if (!quote) {
        throw new NotFoundException('Quote not found.');
      }

      await tx.quote.updateMany({
        where: { requestId, NOT: { id: quoteId } },
        data: { status: 'rejected' },
      });
      await tx.quote.update({
        where: { id: quoteId },
        data: { status: 'accepted' },
      });

      return this.toDetail(await this.requireDetail(requestId, tx));
    });
  }

  /** Demo checkout only outside production. Prefer Paystack initialize/verify. */
  async payQuote(userId: string, requestId: string, quoteId: string) {
    if (isProduction(this.config)) {
      throw new GoneException(
        'Demo checkout is disabled. Use Paystack initialize and verify.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const request = await this.loadDetail(requestId, tx);
      if (!request || request.userId !== userId) {
        throw new NotFoundException('Request not found.');
      }
      if (request.status !== 'quoted' && request.status !== 'approved_paid') {
        throw new BadRequestException('This quote can no longer be paid.');
      }

      const quote = request.quotes.find((item) => item.id === quoteId);
      if (!quote) {
        throw new NotFoundException('Quote not found.');
      }
      if (quote.status === 'rejected') {
        throw new BadRequestException('This quote was rejected.');
      }

      if (request.status === 'approved_paid' && quote.status === 'accepted') {
        return this.toDetail(request);
      }

      await tx.quote.updateMany({
        where: { requestId, NOT: { id: quoteId } },
        data: { status: 'rejected' },
      });
      await tx.quote.update({
        where: { id: quoteId },
        data: { status: 'accepted' },
      });

      const paidAt = new Date();
      if (request.payment) {
        await tx.payment.update({
          where: { id: request.payment.id },
          data: {
            amount: quote.totalCost,
            gateway: 'paystack',
            gatewayRef: `demo_${quote.id}`,
            status: 'paid',
            paidAt,
          },
        });
      } else {
        await tx.payment.create({
          data: {
            requestId,
            amount: quote.totalCost,
            gateway: 'paystack',
            gatewayRef: `demo_${quote.id}`,
            status: 'paid',
            paidAt,
          },
        });
      }

      await tx.request.update({
        where: { id: requestId },
        data: { status: 'approved_paid' },
      });

      await tx.statusUpdate.create({
        data: {
          requestId,
          status: 'approved_paid',
          note: 'Demo payment received.',
          updatedBy: userId,
        },
      });

      await tx.notification.create({
        data: this.notificationData(
          request.reference,
          request.id,
          request.user,
          'approved_paid',
        ),
      });

      return this.toDetail(await this.requireDetail(requestId, tx));
    }).then(async (detail) => {
      const paid = detail.quotes.find((q) => q.status === 'accepted');
      await this.emailStatusNotice(
        detail.user,
        detail.request,
        'approved_paid',
        {
          amountNgn: paid
            ? Number(paid.totalCost)
            : detail.payment
              ? Number(detail.payment.amount)
              : undefined,
        },
      );
      return detail;
    });
  }

  /** Finalize payment after Paystack verify/webhook. */
  async completePaystackPayment(
    userId: string,
    requestId: string,
    quoteId: string,
    gatewayRef: string,
    paidAmountKobo?: number,
    currency?: string,
  ) {
    const detail = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT id FROM "Request" WHERE id = ${requestId} FOR UPDATE
      `;

      const existingByRef = await tx.payment.findUnique({
        where: { gatewayRef },
      });
      if (existingByRef && existingByRef.requestId === requestId) {
        const paid = await this.loadDetail(requestId, tx);
        if (paid) return this.toDetail(paid);
      }
      if (existingByRef && existingByRef.requestId !== requestId) {
        throw new BadRequestException('Payment reference already used.');
      }

      const request = await this.loadDetail(requestId, tx);
      if (!request || request.userId !== userId) {
        throw new NotFoundException('Request not found.');
      }

      if (request.status !== 'quoted' && request.status !== 'approved_paid') {
        throw new BadRequestException('This request cannot be paid in its current status.');
      }

      const quote = request.quotes.find((item) => item.id === quoteId);
      if (!quote) {
        throw new NotFoundException('Quote not found.');
      }
      if (quote.status === 'rejected') {
        throw new BadRequestException('This quote was rejected.');
      }

      if (request.status === 'approved_paid' && quote.status === 'accepted') {
        return this.toDetail(request);
      }

      if (paidAmountKobo != null) {
        const expected = Math.round(Number(quote.totalCost) * 100);
        if (paidAmountKobo !== expected) {
          throw new BadRequestException('Payment amount does not match quote.');
        }
      }
      if (currency && currency.toUpperCase() !== 'NGN') {
        throw new BadRequestException('Unsupported payment currency.');
      }

      await tx.quote.updateMany({
        where: { requestId, NOT: { id: quoteId } },
        data: { status: 'rejected' },
      });
      await tx.quote.update({
        where: { id: quoteId },
        data: { status: 'accepted' },
      });

      const paidAt = new Date();
      if (request.payment) {
        await tx.payment.update({
          where: { id: request.payment.id },
          data: {
            amount: quote.totalCost,
            gateway: 'paystack',
            gatewayRef,
            status: 'paid',
            paidAt,
          },
        });
      } else {
        await tx.payment.create({
          data: {
            requestId,
            amount: quote.totalCost,
            gateway: 'paystack',
            gatewayRef,
            status: 'paid',
            paidAt,
          },
        });
      }

      await tx.request.update({
        where: { id: requestId },
        data: { status: 'approved_paid' },
      });

      await tx.statusUpdate.create({
        data: {
          requestId,
          status: 'approved_paid',
          note: 'Paystack payment received.',
          updatedBy: userId,
        },
      });

      await tx.notification.create({
        data: this.notificationData(
          request.reference,
          request.id,
          request.user,
          'approved_paid',
        ),
      });

      return this.toDetail(await this.requireDetail(requestId, tx));
    });

    await this.emailStatusNotice(
      detail.user,
      detail.request,
      'approved_paid',
      {
        amountNgn: detail.payment
          ? Number(detail.payment.amount)
          : detail.quotes.find((q) => q.status === 'accepted')
            ? Number(
                detail.quotes.find((q) => q.status === 'accepted')!.totalCost,
              )
            : undefined,
      },
    );
    return detail;
  }

  async listOpsUsers() {
    const users = await this.prisma.opsUser.findMany({
      orderBy: { email: 'asc' },
      include: {
        credential: { select: { disabled: true } },
        roleRelation: true,
      },
    });
    return users.map((user) => ({
      id: user.id,
      name: user.name ?? '',
      email: user.email,
      role: user.role,
      roleId: user.roleId,
      roleSlug: user.roleRelation?.slug ?? user.role,
      roleName: user.roleRelation?.name ?? user.role,
      disabled: user.credential?.disabled ?? false,
      mustChangePassword: user.mustChangePassword,
    }));
  }

  async requestStats() {
    const [grouped, unassigned] = await Promise.all([
      this.prisma.request.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.request.count({ where: { assignedOpsUserId: null } }),
    ]);
    const byStatus: Record<string, number> = {};
    for (const row of grouped) {
      byStatus[row.status] = row._count._all;
    }
    return { byStatus, unassigned, total: Object.values(byStatus).reduce((a, b) => a + b, 0) };
  }

  async listRequests(filters: RequestFiltersDto) {
    const search = filters.search?.trim() ?? '';
    const status =
      filters.status && filters.status !== 'all' ? filters.status : undefined;
    const channel =
      filters.channel && filters.channel !== 'all' ? filters.channel : undefined;
    const take = Math.min(Math.max(filters.limit ?? 50, 1), 100);
    const cursor = filters.cursor?.trim();
    const assignee = filters.assignee?.trim();

    const rows = await this.prisma.request.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(channel ? { channel } : {}),
        ...(assignee === 'unassigned'
          ? { assignedOpsUserId: null }
          : assignee
            ? { assignedOpsUserId: assignee }
            : {}),
        ...(search
          ? {
              OR: [
                { reference: { contains: search, mode: 'insensitive' } },
                { sourceValue: { contains: search, mode: 'insensitive' } },
                { productName: { contains: search, mode: 'insensitive' } },
                { user: { name: { contains: search, mode: 'insensitive' } } },
                { user: { email: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: SUMMARY_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const items = page.map((request) =>
      this.toDetail(request as unknown as RequestWithDetail),
    );

    return {
      items,
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    };
  }

  async getRequest(id: string) {
    const request = await this.loadDetail(id);
    if (!request) {
      throw new NotFoundException('Request not found.');
    }
    return this.toDetail(request);
  }

  async claimRequest(id: string, opsUserId: string) {
    const detail = await this.assignInternal(id, opsUserId);
    await this.audit.logOps({
      opsUserId,
      action: 'request.claim',
      entityType: 'request',
      entityId: id,
      after: { assignedOpsUserId: opsUserId },
    });
    return detail;
  }

  async assignRequest(id: string, opsUserId: string, actorId?: string) {
    const opsUser = await this.prisma.opsUser.findUnique({
      where: { id: opsUserId },
    });
    if (!opsUser) {
      throw new NotFoundException('Ops user not found.');
    }
    const detail = await this.assignInternal(id, opsUserId);
    await this.audit.logOps({
      opsUserId: actorId ?? opsUserId,
      action: 'request.assign',
      entityType: 'request',
      entityId: id,
      after: { assignedOpsUserId: opsUserId },
    });
    return detail;
  }

  async submitQuotes(
    requestId: string,
    opsUserId: string,
    drafts: QuoteDraftDto[],
  ) {
    if (drafts.length === 0) {
      throw new BadRequestException('Add at least one quote.');
    }

    return this.prisma.$transaction(async (tx) => {
      const request = await this.loadDetail(requestId, tx);
      if (!request) {
        throw new NotFoundException('Request not found.');
      }

      await tx.quote.deleteMany({ where: { requestId } });
      await tx.quote.createMany({
        data: drafts.map((draft) => ({
          requestId,
          agentId: opsUserId,
          supplierRef: draft.supplierRef,
          unitPrice: draft.unitPrice,
          moq: draft.moq,
          productCost: draft.productCost,
          freightEstimate: draft.freightEstimate,
          serviceFee: draft.serviceFee,
          totalCost:
            draft.productCost + draft.freightEstimate + draft.serviceFee,
          leadTime: draft.leadTime,
          isAlternative: draft.isAlternative,
          status: 'sent',
        })),
      });

      await tx.request.update({
        where: { id: requestId },
        data: {
          status: 'quoted',
          assignedOpsUserId: request.assignedOpsUserId ?? opsUserId,
        },
      });

      await tx.statusUpdate.create({
        data: {
          requestId,
          status: 'quoted',
          note: 'Quote sent to the requester.',
          updatedBy: opsUserId,
        },
      });

      await tx.notification.create({
        data: this.notificationData(
          request.reference,
          request.id,
          request.user,
          'quoted',
        ),
      });

      return this.toDetail(await this.requireDetail(requestId, tx));
    }).then(async (detail) => {
      await this.emailStatusNotice(
        detail.user,
        detail.request,
        'quoted',
      );
      return detail;
    });
  }

  /** Cancel a paid order (before procurement) and refund via Paystack. */
  async cancelPaidRequest(
    requestId: string,
    opsUserId: string,
    input: CancelRequestDto,
  ) {
    const request = await this.loadDetail(requestId);
    if (!request) {
      throw new NotFoundException('Request not found.');
    }
    if (request.status !== 'approved_paid') {
      throw new BadRequestException(
        'Only paid orders that have not been procured can be cancelled for an automatic refund.',
      );
    }
    const payment = request.payment;
    if (!payment || payment.status !== 'paid') {
      throw new BadRequestException('No paid payment found for this order.');
    }

    const reasonLabel = CANCEL_REASON_LABELS[input.reason] ?? input.reason;
    const note =
      input.note?.trim() ||
      (input.reason === 'out_of_stock'
        ? 'Cancelled: out of stock. Refund started.'
        : `Cancelled: ${reasonLabel}.`);

    const refund = await this.attemptPaystackRefund(payment.gatewayRef);

    if (refund.ok) {
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'refunded',
            refundRef: refund.refundRef,
            refundedAt: new Date(),
          },
        });
        await tx.request.update({
          where: { id: requestId },
          data: {
            status: 'cancelled',
            cancelReason: input.reason,
            cancelNote: input.note?.trim() || null,
          },
        });
        await tx.statusUpdate.create({
          data: {
            requestId,
            status: 'cancelled',
            note,
            updatedBy: opsUserId,
          },
        });
        await tx.notification.create({
          data: this.notificationData(
            request.reference,
            request.id,
            request.user,
            'cancelled',
          ),
        });
      });

      const detail = this.toDetail(await this.requireDetail(requestId));
      await this.audit.logOps({
        opsUserId,
        action: 'request.cancel',
        entityType: 'request',
        entityId: requestId,
        after: { reason: input.reason, refund: 'refunded' },
      });
      await this.emailStatusNotice(request.user, detail.request, 'cancelled', {
        amountNgn: Number(payment.amount),
        cancelReason: reasonLabel,
      });
      return detail;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'refund_pending' },
      });
      await tx.request.update({
        where: { id: requestId },
        data: {
          status: 'cancelled',
          cancelReason: input.reason,
          cancelNote: input.note?.trim() || null,
        },
      });
      await tx.statusUpdate.create({
        data: {
          requestId,
          status: 'cancelled',
          note: `${note} Refund is pending retry.`,
          updatedBy: opsUserId,
        },
      });
    });

    const detail = this.toDetail(await this.requireDetail(requestId));
    await this.audit.logOps({
      opsUserId,
      action: 'request.cancel',
      entityType: 'request',
      entityId: requestId,
      after: { reason: input.reason, refund: 'refund_pending' },
    });
    return detail;
  }

  async retryRefund(requestId: string, opsUserId: string) {
    const request = await this.loadDetail(requestId);
    if (!request) {
      throw new NotFoundException('Request not found.');
    }
    const payment = request.payment;
    if (!payment || payment.status !== 'refund_pending') {
      throw new BadRequestException('No pending refund for this order.');
    }

    const refund = await this.attemptPaystackRefund(payment.gatewayRef);
    if (!refund.ok) {
      throw new BadRequestException(
        refund.message || 'Refund still failed. Try again shortly.',
      );
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'refunded',
        refundRef: refund.refundRef,
        refundedAt: new Date(),
      },
    });
    await this.prisma.statusUpdate.create({
      data: {
        requestId,
        status: 'cancelled',
        note: 'Refund completed on retry.',
        updatedBy: opsUserId,
      },
    });

    const detail = this.toDetail(await this.requireDetail(requestId));
    await this.audit.logOps({
      opsUserId,
      action: 'payment.refund_retry',
      entityType: 'request',
      entityId: requestId,
      after: { refundRef: refund.refundRef },
    });
    const reasonLabel =
      CANCEL_REASON_LABELS[request.cancelReason ?? 'other'] ?? 'Cancelled';
    await this.emailStatusNotice(request.user, detail.request, 'cancelled', {
      amountNgn: Number(payment.amount),
      cancelReason: reasonLabel,
    });
    return detail;
  }

  private async attemptPaystackRefund(gatewayRef: string): Promise<{
    ok: boolean;
    refundRef?: string;
    message?: string;
  }> {
    const secret = this.config.get<string>('PAYSTACK_SECRET_KEY')?.trim();
    if (!secret) {
      if (isProduction(this.config)) {
        return { ok: false, message: 'Paystack is not configured.' };
      }
      return { ok: true, refundRef: `demo_refund_${Date.now()}` };
    }

    try {
      const response = await fetch('https://api.paystack.co/refund', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transaction: gatewayRef }),
      });
      const json = (await response.json()) as {
        status?: boolean;
        message?: string;
        data?: { id?: number | string; transaction?: { reference?: string } };
      };
      if (!response.ok || !json.status) {
        return {
          ok: false,
          message: json.message || 'Paystack refund failed.',
        };
      }
      return {
        ok: true,
        refundRef: String(
          json.data?.id ?? json.data?.transaction?.reference ?? gatewayRef,
        ),
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Refund request failed.',
      };
    }
  }

  async updateStatus(
    requestId: string,
    opsUserId: string,
    input: UpdateStatusDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const request = await this.loadDetail(requestId, tx);
      if (!request) {
        throw new NotFoundException('Request not found.');
      }
      if (request.status === 'cancelled') {
        throw new BadRequestException('This order is cancelled.');
      }
      if (input.status === 'cancelled') {
        throw new BadRequestException(
          'Use the cancel endpoint to cancel and refund a paid order.',
        );
      }
      if (input.status === 'quoted' && request.status === 'submitted') {
        throw new BadRequestException(
          'Submit a quote to move this request to Quoted.',
        );
      }
      if (
        input.status === 'approved_paid' &&
        request.status !== 'approved_paid'
      ) {
        throw new BadRequestException('Payment is completed by the requester.');
      }

      if (POST_PAYMENT.includes(input.status)) {
        const paidIdx = OPS_STATUS_ORDER.indexOf('approved_paid');
        const currentIdx = OPS_STATUS_ORDER.indexOf(request.status);
        const targetIdx = OPS_STATUS_ORDER.indexOf(input.status);
        if (currentIdx < paidIdx) {
          throw new BadRequestException(
            'Cannot move past payment before the requester pays.',
          );
        }
        if (targetIdx < currentIdx) {
          throw new BadRequestException('Cannot move status backwards.');
        }
        if (targetIdx > currentIdx + 1) {
          throw new BadRequestException(
            'Advance one status step at a time.',
          );
        }
      }

      await tx.request.update({
        where: { id: requestId },
        data: { status: input.status },
      });

      await tx.statusUpdate.create({
        data: {
          requestId,
          status: input.status,
          note:
            input.note.trim() ||
            REQUESTER_STATUS_LABELS[input.status] ||
            input.status,
          updatedBy: opsUserId,
        },
      });

      await tx.notification.create({
        data: this.notificationData(
          request.reference,
          request.id,
          request.user,
          input.status,
        ),
      });

      return this.toDetail(await this.requireDetail(requestId, tx));
    }).then(async (detail) => {
      await this.audit.logOps({
        opsUserId,
        action: 'status.update',
        entityType: 'request',
        entityId: requestId,
        after: { status: input.status, note: input.note },
      });
      await this.emailStatusNotice(
        detail.user,
        detail.request,
        input.status,
      );
      return detail;
    });
  }

  private async assignInternal(id: string, opsUserId: string) {
    const request = await this.prisma.request.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException('Request not found.');
    }

    await this.prisma.request.update({
      where: { id },
      data: { assignedOpsUserId: opsUserId },
    });

    return this.toDetail(await this.requireDetail(id));
  }

  private async requireDetail(
    id: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<RequestWithDetail> {
    const request = await this.loadDetail(id, client);
    if (!request) {
      throw new NotFoundException('Request not found.');
    }
    return request;
  }

  private async loadDetail(
    id: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<RequestWithDetail | null> {
    return client.request.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
  }

  private toDetail(request: RequestWithDetail) {
    return serializeRequestDetail({
      request,
      user: request.user,
      quotes: request.quotes,
      payment: request.payment,
      history: request.history,
      notifications: request.notifications,
      assignedOpsUser: request.assignedOpsUser,
    });
  }

  private async nextReference() {
    const rows = await this.prisma.$queryRaw<
      Array<{ nextval: bigint | number }>
    >`
      SELECT nextval('request_reference_seq') AS nextval
    `;
    return `CP-${rows[0].nextval}`;
  }

  private assertCaps(
    user: User,
    input: {
      quantity: number;
      budgetMax: number;
      budgetScope?: 'per_unit' | 'total';
    },
  ) {
    const caps = ACCOUNT_CAPS[user.accountType];
    if (input.quantity > caps.maxQuantity) {
      throw new BadRequestException(
        `${caps.label} accounts can request up to ${caps.maxQuantity} units for now.`,
      );
    }
    const effectiveTotal =
      input.budgetScope === 'per_unit'
        ? input.budgetMax * input.quantity
        : input.budgetMax;
    if (effectiveTotal > caps.maxBudgetNgn) {
      throw new BadRequestException(
        `${caps.label} accounts have a ₦${caps.maxBudgetNgn.toLocaleString('en-NG')} order budget cap in phase 1.`,
      );
    }
  }

  private notificationData(
    reference: string,
    requestId: string,
    user: User,
    status: RequestStatus,
  ) {
    const label = (REQUESTER_STATUS_LABELS[status] ?? status).toLowerCase();
    return {
      requestId,
      channel: this.preferredChannel(user.phone),
      message: `${reference}: ${label}.`,
    };
  }

  private preferredChannel(phone: string): NotificationChannel {
    return phone.startsWith('+234') ? 'whatsapp' : 'email';
  }

  private async emailStatusNotice(
    user: { email: string; name: string },
    request: {
      id: string;
      reference: string;
      channel?: string;
      sourceType: string;
      sourceValue: string;
      quantity: number;
      budgetMax: number;
      qualityNotes?: string | null;
      flexibility?: string | null;
      productName?: string | null;
      productDescription?: string | null;
      budgetScope?: string | null;
      needByDate?: string | null;
      needByTimeframe?: string | null;
      references?: Array<{ kind: string; value: string }> | null;
    },
    status: RequestStatus,
    extras?: {
      amountNgn?: number;
      cancelReason?: string;
      receiptPdf?: { filename: string; contentBase64: string };
    },
  ) {
    const label = REQUESTER_STATUS_LABELS[status] ?? status;
    const first = user.name.split(' ')[0] || user.name;
    const reference = request.reference;
    const context = buildRequestEmailContext(request);
    const isCatalog = request.channel === 'catalog';
    const viewPath = isCatalog
      ? `/orders/${request.id}`
      : `/requests/${request.id}`;

    let receiptPdf = extras?.receiptPdf;
    if (
      !receiptPdf &&
      (status === 'approved_paid' || status === 'cancelled')
    ) {
      try {
        receiptPdf = await this.buildReceiptAttachment(
          request.id,
          user,
          status === 'cancelled' ? 'refund' : 'purchase',
          extras?.cancelReason,
        );
      } catch {
        // Email still sends without PDF if generation fails.
      }
    }

    const copy: Partial<
      Record<RequestStatus, { subject: string; headline: string; body: string }>
    > = {
      submitted: {
        subject: `${reference}: we got your request`,
        headline: 'We got your request',
        body: `Hi ${first},\n\nThanks for asking ConnectPort. Your request ${reference} is in. We will confirm availability and send a landed-cost quote soon.`,
      },
      quoted: isCatalog
        ? {
            subject: `${reference}: ready to pay`,
            headline: 'Your order is ready',
            body: `Hi ${first},\n\n${reference} is ready. Complete payment for the landed cost (product, freight estimate, and service fee) to confirm your order.`,
          }
        : {
            subject: `${reference}: your quote is ready`,
            headline: 'Your quote is ready',
            body: `Hi ${first},\n\nOpen ${reference} to review the landed cost (product, freight estimate, and service fee). Approve when you are ready to pay.`,
          },
      approved_paid: {
        subject: `${reference}: payment received`,
        headline: 'Payment confirmed',
        body:
          extras?.amountNgn != null
            ? `Hi ${first},\n\nWe received ₦${extras.amountNgn.toLocaleString('en-NG')} for ${reference}. Your receipt is attached. Procurement starts next.`
            : `Hi ${first},\n\nPayment for ${reference} is confirmed. Your receipt is attached. Procurement starts next.`,
      },
      procured: {
        subject: `${reference}: procured`,
        headline: 'Goods procured',
        body: `Hi ${first},\n\n${reference} is purchased from the supplier. Next stop: our China warehouse.`,
      },
      in_transit_china_warehouse: {
        subject: `${reference}: at China warehouse`,
        headline: 'At our China warehouse',
        body: `Hi ${first},\n\n${reference} arrived at our Guangzhou hub. We are checking it against your notes before freight.`,
      },
      in_transit_freight: {
        subject: `${reference}: on the way to Nigeria`,
        headline: 'In transit to Nigeria',
        body: `Hi ${first},\n\n${reference} is on the water toward Lagos. We will email you when it clears into our Nigeria warehouse.`,
      },
      arrived_nigeria_warehouse: {
        subject: `${reference}: arrived in Nigeria`,
        headline: 'Arrived in Nigeria',
        body: `Hi ${first},\n\n${reference} is at our Lagos warehouse. Delivery or pickup is next.`,
      },
      delivered: {
        subject: `${reference}: delivered`,
        headline: 'Delivered',
        body: `Hi ${first},\n\n${reference} is with you. Thanks for sourcing with ConnectPort.`,
      },
      cancelled: {
        subject: `${reference}: cancelled and refunded`,
        headline: 'Order cancelled',
        body:
          extras?.amountNgn != null
            ? `Hi ${first},\n\n${reference} was cancelled${extras?.cancelReason ? ` (${extras.cancelReason})` : ''}. We refunded ₦${extras.amountNgn.toLocaleString('en-NG')}. It may take a few business days to show on your statement.`
            : `Hi ${first},\n\n${reference} was cancelled${extras?.cancelReason ? ` (${extras.cancelReason})` : ''}. If you paid, a refund has been started.`,
      },
    };

    const selected = copy[status] ?? {
      subject: `${reference}: ${label}`,
      headline: `Update on ${reference}`,
      body: `Hi ${first},\n\nYour request ${reference} is now: ${label}.`,
    };

    await this.mailQueue.enqueue({
      to: user.email,
      subject: selected.subject,
      headline: selected.headline,
      body: selected.body,
      ctaLabel:
        status === 'quoted'
          ? isCatalog
            ? 'Pay now'
            : 'View quote'
          : status === 'cancelled'
            ? 'Browse store'
            : isCatalog
              ? 'View order'
              : 'View request',
      ctaPath: status === 'cancelled' ? '/store' : viewPath,
      snippet: context.snippet,
      details: context.details,
      attachments: receiptPdf
        ? [
            {
              filename: receiptPdf.filename,
              content: receiptPdf.contentBase64,
            },
          ]
        : undefined,
    });
  }

  private async buildReceiptAttachment(
    requestId: string,
    user: { name: string; email: string },
    kind: 'purchase' | 'refund',
    cancelReason?: string,
  ): Promise<{ filename: string; contentBase64: string } | undefined> {
    const detail = await this.loadDetail(requestId);
    if (!detail) return undefined;
    const quote =
      detail.quotes.find((q) => q.status === 'accepted') ??
      detail.quotes.find((q) => q.status === 'sent') ??
      detail.quotes[0];
    const payment = detail.payment;
    if (!quote || !payment) return undefined;

    const productName =
      detail.productName?.trim() ||
      detail.sourceValue?.trim() ||
      'ConnectPort order';
    const paidAt = payment.paidAt
      ? payment.paidAt.toLocaleString('en-NG')
      : new Date().toLocaleString('en-NG');
    const contentBase64 = await buildReceiptPdfBase64({
      kind,
      reference: detail.reference,
      title: kind === 'refund' ? 'Credit note' : 'Payment receipt',
      buyerName: user.name,
      buyerEmail: user.email,
      paidAt,
      paymentRef: payment.gatewayRef,
      channel: detail.channel === 'catalog' ? 'catalog' : 'sourcing',
      productName,
      quantity: detail.quantity,
      lines: [
        {
          label: 'Product',
          amount: Number(quote.productCost),
          hint: `${Number(quote.unitPrice).toLocaleString('en-NG')} × ${detail.quantity}`,
        },
        {
          label: 'Freight estimate',
          amount: Number(quote.freightEstimate),
        },
        {
          label: 'Service fee',
          amount: Number(quote.serviceFee),
        },
      ],
      total: Number(quote.totalCost),
      note:
        kind === 'refund'
          ? `Refund${cancelReason ? `: ${cancelReason}` : ''}. Funds return to the original payment method.`
          : 'Includes product, freight estimate to our Nigeria warehouse, and service fee.',
    });

    const prefix = kind === 'refund' ? 'ConnectPort-credit' : 'ConnectPort-receipt';
    return {
      filename: `${prefix}-${detail.reference}.pdf`,
      contentBase64,
    };
  }
}
