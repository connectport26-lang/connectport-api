import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationChannel,
  Prisma,
  RequestStatus,
  User,
} from '@prisma/client';
import { ACCOUNT_CAPS, REQUESTER_STATUS_LABELS } from '../common/constants';
import {
  serializeRequest,
  serializeRequestDetail,
} from '../common/serializers';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateRequestDto,
  QuoteDraftDto,
  RequestFiltersDto,
  UpdateStatusDto,
} from './dto/requests.dto';

const DETAIL_INCLUDE = {
  user: true,
  assignedOpsUser: true,
  quotes: true,
  payment: true,
  history: { orderBy: { createdAt: 'asc' as const } },
  notifications: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.RequestInclude;

type RequestWithDetail = Prisma.RequestGetPayload<{
  include: typeof DETAIL_INCLUDE;
}>;

@Injectable()
export class RequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async listMyRequests(userId: string) {
    const requests = await this.prisma.request.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return requests.map(serializeRequest);
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

  async listOpsUsers() {
    const users = await this.prisma.opsUser.findMany({
      orderBy: { name: 'asc' },
    });
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    }));
  }

  async listRequests(filters: RequestFiltersDto) {
    const search = filters.search?.trim() ?? '';
    const status =
      filters.status && filters.status !== 'all' ? filters.status : undefined;

    const requests = await this.prisma.request.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(search
          ? {
              OR: [
                { reference: { contains: search, mode: 'insensitive' } },
                { sourceValue: { contains: search, mode: 'insensitive' } },
                { user: { name: { contains: search, mode: 'insensitive' } } },
                { user: { email: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return requests.map((request) => this.toDetail(request));
  }

  async getRequest(id: string) {
    const request = await this.loadDetail(id);
    if (!request) {
      throw new NotFoundException('Request not found.');
    }
    return this.toDetail(request);
  }

  async claimRequest(id: string, opsUserId: string) {
    return this.assignInternal(id, opsUserId);
  }

  async assignRequest(id: string, opsUserId: string) {
    const opsUser = await this.prisma.opsUser.findUnique({
      where: { id: opsUserId },
    });
    if (!opsUser) {
      throw new NotFoundException('Ops user not found.');
    }
    return this.assignInternal(id, opsUserId);
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
    });
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

  private assertCaps(user: User, input: CreateRequestDto) {
    const caps = ACCOUNT_CAPS[user.accountType];
    if (input.quantity > caps.maxQuantity) {
      throw new BadRequestException(
        `${caps.label} accounts can request up to ${caps.maxQuantity} units for now.`,
      );
    }
    if (input.budgetMax > caps.maxBudgetNgn) {
      throw new BadRequestException(
        `${caps.label} accounts have a ₦${caps.maxBudgetNgn.toLocaleString('en-NG')} budget cap in phase 1.`,
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
}
