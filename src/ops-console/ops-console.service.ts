import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailQueueService } from '../queue/queue.module';
import {
  ALL_OPS_PERMISSIONS,
} from '../common/permissions';
import {
  calculateLandingPrice,
  type LandingPriceConfig,
} from '../common/pricing';
import { buildRequestEmailContext } from '../mail/mail.context';
import {
  CreateOpsAgentDto,
  CreateProductFindDto,
  CreateRoleDto,
  CreateTeamDto,
  RejectProductFindDto,
  UpdateMarketplaceDto,
  UpdatePricingConfigDto,
  UpdateRoleDto,
} from './dto/ops-console.dto';
import { OpsNotifyService } from '../notifications/ops-notify.service';
import { ProductsService } from '../products/products.service';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class OpsConsoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailQueue: MailQueueService,
    private readonly config: ConfigService,
    private readonly opsNotify: OpsNotifyService,
    private readonly products: ProductsService,
  ) {}

  listCustomers(search?: string) {
    const q = search?.trim();
    return this.prisma.user
      .findMany({
        where: q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q, mode: 'insensitive' } },
              ],
            }
          : undefined,
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          accountType: true,
          createdAt: true,
          _count: { select: { requests: true } },
        },
      })
      .then((rows) =>
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email,
          phone: row.phone,
          accountType: row.accountType,
          createdAt: row.createdAt.toISOString(),
          requestCount: row._count.requests,
        })),
      );
  }

  async listActivity(limit = 40, cursor?: string) {
    const take = Math.min(Math.max(limit, 1), 100);
    const rows = await this.prisma.statusUpdate.findMany({
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        request: {
          select: {
            id: true,
            reference: true,
            productName: true,
            sourceValue: true,
            user: { select: { name: true, email: true } },
          },
        },
      },
    });

    const hasMore = rows.length > take;
    const items = rows.slice(0, take).map((row) => ({
      id: row.id,
      requestId: row.requestId,
      reference: row.request.reference,
      title:
        row.request.productName?.trim() ||
        row.request.sourceValue.slice(0, 80),
      status: row.status,
      note: row.note,
      updatedBy: row.updatedBy,
      customerName: row.request.user.name,
      createdAt: row.createdAt.toISOString(),
    }));

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id : null,
    };
  }

  async listReviews() {
    const requests = await this.prisma.request.findMany({
      where: {
        OR: [
          { status: 'quoted' },
          { quotes: { some: { status: { in: ['accepted', 'rejected'] } } } },
        ],
      },
      include: {
        quotes: { orderBy: { createdAt: 'desc' } },
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return requests.map((request) => ({
      id: request.id,
      reference: request.reference,
      status: request.status,
      marketplaceEligible: request.marketplaceEligible ?? false,
      productName:
        request.productName?.trim() || request.sourceValue.slice(0, 80),
      customer: request.user,
      quotes: request.quotes.map((quote) => ({
        id: quote.id,
        status: quote.status,
        totalCost: Number(quote.totalCost),
        supplierRef: quote.supplierRef,
        createdAt: quote.createdAt.toISOString(),
      })),
      createdAt: request.createdAt.toISOString(),
    }));
  }

  async setMarketplaceEligible(id: string, input: UpdateMarketplaceDto) {
    const request = await this.prisma.request.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Request not found.');
    const updated = await this.prisma.request.update({
      where: { id },
      data: { marketplaceEligible: input.marketplaceEligible },
    });
    return {
      id: updated.id,
      marketplaceEligible: updated.marketplaceEligible ?? false,
    };
  }

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { opsUsers: true } } },
    });
    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      slug: role.slug,
      description: role.description,
      permissions: role.permissions,
      isSystem: role.isSystem,
      memberCount: role._count.opsUsers,
      createdAt: role.createdAt.toISOString(),
    }));
  }

  async createRole(input: CreateRoleDto) {
    const name = input.name.trim();
    const slug = this.slugify(name);
    const existing = await this.prisma.role.findUnique({ where: { slug } });
    if (existing) {
      throw new BadRequestException('A role with this name already exists.');
    }
    const role = await this.prisma.role.create({
      data: {
        name,
        slug,
        description: input.description?.trim() || null,
        permissions: input.permissions,
        isSystem: false,
      },
    });
    return {
      id: role.id,
      name: role.name,
      slug: role.slug,
      description: role.description,
      permissions: role.permissions,
      isSystem: role.isSystem,
      memberCount: 0,
      createdAt: role.createdAt.toISOString(),
    };
  }

  async updateRole(id: string, input: UpdateRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found.');
    if (role.isSystem && role.slug === 'admin' && input.permissions) {
      const missing = ALL_OPS_PERMISSIONS.filter(
        (p) => !input.permissions!.includes(p),
      );
      if (missing.length) {
        throw new BadRequestException(
          'The Admin system role must keep all permissions.',
        );
      }
    }
    const updated = await this.prisma.role.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() || null }
          : {}),
        ...(input.permissions ? { permissions: input.permissions } : {}),
      },
      include: { _count: { select: { opsUsers: true } } },
    });
    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      description: updated.description,
      permissions: updated.permissions,
      isSystem: updated.isSystem,
      memberCount: updated._count.opsUsers,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async createAgent(input: CreateOpsAgentDto) {
    const email = input.email.trim().toLowerCase();
    const role = await this.prisma.role.findUnique({
      where: { id: input.roleId },
    });
    if (!role) throw new BadRequestException('Select a valid role.');

    if (
      role.slug === 'admin' &&
      input.confirmStepUp !== 'CREATE_ADMIN'
    ) {
      throw new BadRequestException(
        'Creating an admin requires step-up confirmation (confirmStepUp=CREATE_ADMIN).',
      );
    }

    const existing = await this.prisma.credential.findUnique({
      where: { email },
    });
    if (existing) {
      throw new BadRequestException('An account with this email already exists.');
    }

    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
    const legacyRole = role.slug === 'admin' ? 'admin' : 'agent';

    const opsUser = await this.prisma.opsUser.create({
      data: {
        name: null,
        email,
        role: legacyRole,
        roleId: role.id,
        mustChangePassword: true,
        credential: {
          create: {
            email,
            passwordHash,
            kind: 'ops',
          },
        },
      },
      include: { roleRelation: true },
    });

    const appUrl = (
      this.config.get<string>('APP_URL')?.trim() || 'http://localhost:3000'
    ).replace(/\/$/, '');

    await this.mailQueue.enqueue({
      to: email,
      subject: 'You are invited to ConnectPort ops',
      headline: 'Welcome to the ops console',
      body: `You have been invited as ${role.name}.\n\nSign in at ${appUrl}/profile with this temporary password, then set your own password and name:\n\n${tempPassword}\n\nThis password only works until you finish setup.`,
      ctaLabel: 'Sign in',
      ctaPath: '/profile',
    });

    return {
      id: opsUser.id,
      name: opsUser.name ?? '',
      email: opsUser.email,
      role: legacyRole,
      roleId: role.id,
      roleSlug: role.slug,
      roleName: role.name,
      disabled: false,
      mustChangePassword: true,
    };
  }

  async setAgentDisabled(
    opsUserId: string,
    disabled: boolean,
    actorId: string,
  ) {
    if (opsUserId === actorId) {
      throw new BadRequestException('You cannot disable your own account.');
    }
    const opsUser = await this.prisma.opsUser.findUnique({
      where: { id: opsUserId },
      include: { credential: true, roleRelation: true },
    });
    if (!opsUser?.credential) {
      throw new NotFoundException('Ops user not found.');
    }

    await this.prisma.credential.update({
      where: { id: opsUser.credential.id },
      data: {
        disabled,
        ...(disabled ? { tokenVersion: { increment: 1 } } : {}),
      },
    });

    return {
      id: opsUser.id,
      name: opsUser.name ?? '',
      email: opsUser.email,
      role: opsUser.role,
      roleId: opsUser.roleId,
      roleSlug: opsUser.roleRelation?.slug ?? opsUser.role,
      roleName: opsUser.roleRelation?.name ?? opsUser.role,
      disabled,
    };
  }

  listTeams() {
    return this.prisma.team
      .findMany({
        orderBy: { name: 'asc' },
        include: {
          members: {
            include: {
              opsUser: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                  roleRelation: true,
                },
              },
            },
          },
          _count: { select: { requests: true } },
        },
      })
      .then((teams) =>
        teams.map((team) => ({
          id: team.id,
          name: team.name,
          createdAt: team.createdAt.toISOString(),
          requestCount: team._count.requests,
          members: team.members.map((member) => ({
            id: member.opsUser.id,
            name: member.opsUser.name ?? '',
            email: member.opsUser.email,
            role: member.opsUser.role,
            roleSlug:
              member.opsUser.roleRelation?.slug ?? member.opsUser.role,
          })),
        })),
      );
  }

  async createTeam(input: CreateTeamDto) {
    const team = await this.prisma.team.create({
      data: { name: input.name.trim() },
    });
    return {
      id: team.id,
      name: team.name,
      createdAt: team.createdAt.toISOString(),
      members: [],
      requestCount: 0,
    };
  }

  async addTeamMember(teamId: string, opsUserId: string) {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new NotFoundException('Team not found.');
    const opsUser = await this.prisma.opsUser.findUnique({
      where: { id: opsUserId },
    });
    if (!opsUser) throw new NotFoundException('Ops user not found.');

    await this.prisma.teamMember.upsert({
      where: { teamId_opsUserId: { teamId, opsUserId } },
      create: { teamId, opsUserId },
      update: {},
    });

    return this.listTeams().then((teams) =>
      teams.find((item) => item.id === teamId),
    );
  }

  async removeTeamMember(teamId: string, opsUserId: string) {
    await this.prisma.teamMember.deleteMany({
      where: { teamId, opsUserId },
    });
    return this.listTeams().then((teams) =>
      teams.find((item) => item.id === teamId),
    );
  }

  async getPricingConfig() {
    const row = await this.ensurePricingConfig();
    return this.serializePricing(row);
  }

  async updatePricingConfig(input: UpdatePricingConfigDto) {
    await this.ensurePricingConfig();
    const row = await this.prisma.pricingConfig.update({
      where: { id: 'default' },
      data: {
        shippingRatePerKg: input.shippingRatePerKg,
        agentFeeMode: input.agentFeeMode,
        agentFeeValue: input.agentFeeValue,
        agentFeeMin: input.agentFeeMin ?? null,
        agentFeeMax: input.agentFeeMax ?? null,
        miscMode: input.miscMode,
        miscValue: input.miscValue,
        miscMin: input.miscMin ?? null,
        miscMax: input.miscMax ?? null,
        profitMode: input.profitMode,
        profitValue: input.profitValue,
        profitMin: input.profitMin,
        profitMax: input.profitMax,
        serviceLabel: input.serviceLabel?.trim() || 'Service & logistics',
      },
    });
    return this.serializePricing(row);
  }

  async previewLandingPrice(input: {
    supplierCost: number;
    quantity: number;
    weightKg: number;
  }) {
    const config = await this.getLandingConfig();
    return calculateLandingPrice({
      supplierCost: input.supplierCost,
      quantity: input.quantity,
      weightKgPerUnit: input.weightKg,
      config,
    });
  }

  async listFinds(requestId: string) {
    const finds = await this.prisma.productFind.findMany({
      where: { requestId },
      include: {
        media: true,
        agent: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return finds.map((find) => this.serializeFind(find));
  }

  async createProductFind(
    requestId: string,
    agentId: string,
    input: CreateProductFindDto,
  ) {
    const request = await this.prisma.request.findUnique({
      where: { id: requestId },
      include: { user: true },
    });
    if (!request) throw new NotFoundException('Request not found.');
    if (request.status === 'cancelled') {
      throw new BadRequestException('This request is cancelled.');
    }
    if (input.moq < 1) {
      throw new BadRequestException('MOQ must be at least 1.');
    }

    const description = (input.description ?? '').trim();
    const variations = this.normalizeVariations(input.variations);
    if (input.submitForReview) {
      this.assertFindChecklist({
        title: input.title,
        description,
        media: input.media,
        variations,
        supplierCost: input.supplierCost,
        weightKg: input.weightKg,
        moq: input.moq,
        leadTime: input.leadTime,
      });
    }

    const config = await this.getLandingConfig();
    const landing = calculateLandingPrice({
      supplierCost: input.supplierCost,
      quantity: request.quantity,
      weightKgPerUnit: input.weightKg,
      config,
    });

    const status = input.submitForReview ? 'pending_review' : 'draft';
    const find = await this.prisma.productFind.create({
      data: {
        requestId,
        agentId,
        matchType: input.matchType,
        title: input.title.trim(),
        description,
        notes: input.notes?.trim() ?? '',
        variations,
        supplierCost: input.supplierCost,
        weightKg: input.weightKg,
        moq: input.moq,
        leadTime: input.leadTime.trim(),
        status,
        media: {
          create: input.media.map((item) => ({
            kind: item.kind,
            url: item.url.trim(),
          })),
        },
      },
      include: {
        media: true,
        agent: { select: { id: true, name: true, email: true } },
      },
    });

    if (input.submitForReview) {
      void this.opsNotify.notifyFindPendingReview({
        requestId,
        reference: request.reference,
        findId: find.id,
        findTitle: find.title,
        matchType: find.matchType,
        agentName: find.agent?.name ?? '',
        agentEmail: find.agent?.email ?? '',
        landingTotal: landing.totalCost,
      });
    }

    return {
      find: this.serializeFind(find),
      landingPreview: landing,
    };
  }

  async approveProductFind(
    requestId: string,
    findId: string,
    reviewerId: string,
  ) {
    const find = await this.prisma.productFind.findFirst({
      where: { id: findId, requestId },
      include: {
        media: true,
        agent: { select: { id: true, name: true, email: true } },
        request: { include: { user: true } },
      },
    });
    if (!find) throw new NotFoundException('Find not found.');
    if (find.status !== 'pending_review') {
      throw new BadRequestException('Only finds pending review can be approved.');
    }

    const variations = this.parseVariations(find.variations);
    this.assertFindChecklist({
      title: find.title,
      description: find.description,
      media: find.media,
      variations,
      supplierCost: Number(find.supplierCost),
      weightKg: Number(find.weightKg),
      moq: find.moq,
      leadTime: find.leadTime,
    });

    const request = find.request;
    const config = await this.getLandingConfig();
    const landing = calculateLandingPrice({
      supplierCost: Number(find.supplierCost),
      quantity: request.quantity,
      weightKgPerUnit: Number(find.weightKg),
      config,
    });

    const cover =
      find.media.find((m) => m.kind === 'image')?.url ?? find.media[0]?.url;
    if (!cover) {
      throw new BadRequestException('Find needs at least one image to publish.');
    }

    const productMedia = find.media.map((m) => ({
      kind: m.kind === 'video' ? ('video' as const) : ('image' as const),
      url: m.url,
    }));

    const slugBase = this.slugify(find.title) || 'product';
    let slug = `${slugBase}-${find.id.slice(-6)}`;
    const existingSlug = await this.prisma.product.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (existingSlug) {
      slug = `${slugBase}-${Date.now().toString(36)}`;
    }

    const deliveryDays = this.estimateDeliveryDays(find.leadTime);
    const variationTags = variations
      .filter((v) => v.name.toLowerCase() !== 'none')
      .flatMap((v) => [v.name.toLowerCase(), ...v.options.map((o) => o.toLowerCase())])
      .filter(Boolean)
      .slice(0, 12);

    const product = await this.prisma.product.create({
      data: {
        slug,
        name: find.title.trim(),
        description:
          find.description.trim() ||
          `${find.title.trim()}. Sourced via ConnectPort.`,
        imageUrl: cover,
        media: productMedia,
        unitPrice: landing.unitPrice,
        moq: find.moq,
        weightKg: Number(find.weightKg),
        estimatedDeliveryDays: deliveryDays,
        availability: 'made_to_order',
        status: 'published',
        verified: true,
        tags: variationTags,
        sourceRequestId: requestId,
      },
    });
    await this.products.clearPublishedCatalogCache();

    const quote = await this.prisma.quote.create({
      data: {
        requestId,
        agentId: find.agentId,
        supplierRef: `find:${find.id}`,
        unitPrice: landing.unitPrice,
        moq: find.moq,
        productCost: landing.productCost,
        freightEstimate: landing.freightEstimate,
        serviceFee: landing.serviceFee,
        totalCost: landing.totalCost,
        leadTime: find.leadTime,
        isAlternative: find.matchType === 'alternative',
        status: 'sent',
      },
    });

    const updated = await this.prisma.productFind.update({
      where: { id: find.id },
      data: {
        quoteId: quote.id,
        productId: product.id,
        status: 'sent',
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNote: null,
      },
      include: {
        media: true,
        agent: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    });

    if (request.status === 'submitted') {
      await this.prisma.request.update({
        where: { id: requestId },
        data: {
          status: 'quoted',
          assignedOpsUserId: request.assignedOpsUserId ?? find.agentId,
        },
      });
      await this.prisma.statusUpdate.create({
        data: {
          requestId,
          status: 'quoted',
          note: `Sourcing find approved: ${find.title}.`,
          updatedBy: reviewerId,
        },
      });
    }

    const context = buildRequestEmailContext({
      reference: request.reference,
      sourceType: request.sourceType,
      sourceValue: request.sourceValue,
      quantity: request.quantity,
      budgetMax: Number(request.budgetMax),
      qualityNotes: request.qualityNotes,
      flexibility: request.flexibility,
      productName: request.productName,
      productDescription: request.productDescription,
      budgetScope: request.budgetScope,
      needByDate: request.needByDate?.toISOString() ?? null,
      needByTimeframe: request.needByTimeframe,
    });

    await this.mailQueue.enqueue({
      to: request.user.email,
      subject: `${request.reference}: options ready`,
      headline: 'We found something for you',
      body: `Hi ${request.user.name.split(' ')[0] || request.user.name},\n\nWe have ${find.matchType === 'exact' ? 'an exact match' : 'an alternative'} for ${request.reference}: ${find.title}. Open your quote to review the landed cost.`,
      ctaLabel: 'View quote',
      ctaPath: `/quotes/${quote.id}`,
      snippet: context.snippet,
      details: [
        ...context.details,
        { label: 'Option', value: find.title },
        {
          label: 'Landed total',
          value: `₦${landing.totalCost.toLocaleString('en-NG')}`,
        },
      ],
    });

    return {
      find: this.serializeFind(updated),
      quoteId: quote.id,
      productId: product.id,
      landingPreview: landing,
    };
  }

  async rejectProductFind(
    requestId: string,
    findId: string,
    reviewerId: string,
    input: RejectProductFindDto,
  ) {
    const find = await this.prisma.productFind.findFirst({
      where: { id: findId, requestId },
      include: {
        media: true,
        agent: { select: { id: true, name: true, email: true } },
        request: { select: { reference: true } },
      },
    });
    if (!find) throw new NotFoundException('Find not found.');
    if (find.status !== 'pending_review') {
      throw new BadRequestException('Only finds pending review can be rejected.');
    }

    const note = input.note?.trim() || null;
    const updated = await this.prisma.productFind.update({
      where: { id: find.id },
      data: {
        status: 'rejected',
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNote: note,
      },
      include: {
        media: true,
        agent: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    });

    if (find.agent?.email) {
      await this.mailQueue.enqueue({
        to: find.agent.email,
        subject: `${find.request.reference}: find needs changes`,
        headline: 'Your find was not approved',
        body: `Your find "${find.title}" for ${find.request.reference} was rejected.${note ? `\n\nNote from reviewer: ${note}` : ''}\n\nUpdate the sourcing and submit again when ready.`,
        ctaLabel: 'Open request',
        ctaPath: `/ops/queue/${requestId}`,
      });
    }

    return { find: this.serializeFind(updated) };
  }

  private async ensurePricingConfig() {
    const existing = await this.prisma.pricingConfig.findUnique({
      where: { id: 'default' },
    });
    if (existing) return existing;
    return this.prisma.pricingConfig.create({
      data: {
        id: 'default',
        shippingRatePerKg: 4500,
        agentFeeMode: 'percent',
        agentFeeValue: 5,
        agentFeeMin: 2000,
        agentFeeMax: 50000,
        miscMode: 'fixed',
        miscValue: 5000,
        profitMode: 'percent',
        profitValue: 8,
        profitMin: 25000,
        profitMax: 350000,
        serviceLabel: 'Service & logistics',
      },
    });
  }

  private async getLandingConfig(): Promise<LandingPriceConfig> {
    const row = await this.ensurePricingConfig();
    return {
      shippingRatePerKg: Number(row.shippingRatePerKg),
      agentFeeMode: row.agentFeeMode,
      agentFeeValue: Number(row.agentFeeValue),
      agentFeeMin: row.agentFeeMin != null ? Number(row.agentFeeMin) : null,
      agentFeeMax: row.agentFeeMax != null ? Number(row.agentFeeMax) : null,
      miscMode: row.miscMode,
      miscValue: Number(row.miscValue),
      miscMin: row.miscMin != null ? Number(row.miscMin) : null,
      miscMax: row.miscMax != null ? Number(row.miscMax) : null,
      profitMode: row.profitMode,
      profitValue: Number(row.profitValue),
      profitMin: Number(row.profitMin),
      profitMax: Number(row.profitMax),
      serviceLabel: row.serviceLabel,
    };
  }

  private serializePricing(row: {
    shippingRatePerKg: { toString(): string } | number;
    agentFeeMode: string;
    agentFeeValue: { toString(): string } | number;
    agentFeeMin: { toString(): string } | number | null;
    agentFeeMax: { toString(): string } | number | null;
    miscMode: string;
    miscValue: { toString(): string } | number;
    miscMin: { toString(): string } | number | null;
    miscMax: { toString(): string } | number | null;
    profitMode: string;
    profitValue: { toString(): string } | number;
    profitMin: { toString(): string } | number;
    profitMax: { toString(): string } | number;
    serviceLabel: string;
    updatedAt: Date;
  }) {
    return {
      shippingRatePerKg: Number(row.shippingRatePerKg),
      agentFeeMode: row.agentFeeMode,
      agentFeeValue: Number(row.agentFeeValue),
      agentFeeMin: row.agentFeeMin != null ? Number(row.agentFeeMin) : null,
      agentFeeMax: row.agentFeeMax != null ? Number(row.agentFeeMax) : null,
      miscMode: row.miscMode,
      miscValue: Number(row.miscValue),
      miscMin: row.miscMin != null ? Number(row.miscMin) : null,
      miscMax: row.miscMax != null ? Number(row.miscMax) : null,
      profitMode: row.profitMode,
      profitValue: Number(row.profitValue),
      profitMin: Number(row.profitMin),
      profitMax: Number(row.profitMax),
      serviceLabel: row.serviceLabel,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private serializeFind(find: {
    id: string;
    requestId: string;
    agentId: string;
    matchType: string;
    title: string;
    description?: string | null;
    notes: string;
    variations?: unknown;
    supplierCost: { toString(): string } | number;
    weightKg: { toString(): string } | number;
    moq: number;
    leadTime: string;
    status: string;
    quoteId: string | null;
    productId?: string | null;
    reviewedById?: string | null;
    reviewedAt?: Date | null;
    reviewNote?: string | null;
    createdAt: Date;
    media: Array<{ id: string; kind: string; url: string }>;
    agent?: { id: string; name: string | null; email?: string } | null;
    reviewedBy?: { id: string; name: string | null } | null;
  }) {
    return {
      id: find.id,
      requestId: find.requestId,
      agentId: find.agentId,
      agentName: find.agent?.name ?? '',
      matchType: find.matchType,
      title: find.title,
      description: find.description ?? '',
      notes: find.notes,
      variations: this.parseVariations(find.variations),
      supplierCost: Number(find.supplierCost),
      weightKg: Number(find.weightKg),
      moq: find.moq,
      leadTime: find.leadTime,
      status: find.status,
      quoteId: find.quoteId,
      productId: find.productId ?? null,
      reviewedById: find.reviewedById ?? null,
      reviewedByName: find.reviewedBy?.name ?? null,
      reviewedAt: find.reviewedAt ? find.reviewedAt.toISOString() : null,
      reviewNote: find.reviewNote ?? null,
      createdAt: find.createdAt.toISOString(),
      media: find.media,
    };
  }

  private normalizeVariations(
    input?: Array<{ name: string; options: string[] }>,
  ): Array<{ name: string; options: string[] }> {
    if (!input?.length) return [];
    return input
      .map((row) => ({
        name: row.name.trim(),
        options: (row.options ?? []).map((o) => o.trim()).filter(Boolean),
      }))
      .filter((row) => row.name.length > 0);
  }

  private parseVariations(
    raw: unknown,
  ): Array<{ name: string; options: string[] }> {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (item): item is { name: string; options?: string[] } =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as { name?: unknown }).name === 'string',
      )
      .map((item) => ({
        name: item.name,
        options: Array.isArray(item.options)
          ? item.options.filter((o): o is string => typeof o === 'string')
          : [],
      }));
  }

  private assertFindChecklist(input: {
    title: string;
    description: string;
    media: Array<{ kind: string; url: string }>;
    variations: Array<{ name: string; options: string[] }>;
    supplierCost: number;
    weightKg: number;
    moq: number;
    leadTime: string;
  }) {
    const images = input.media.filter((m) => m.kind === 'image');
    const videos = input.media.filter((m) => m.kind === 'video');
    if (input.title.trim().length < 2) {
      throw new BadRequestException('Product title is required.');
    }
    if (input.description.trim().length < 40) {
      throw new BadRequestException(
        'Customer-facing description must be at least 40 characters.',
      );
    }
    if (!input.supplierCost || input.supplierCost <= 0) {
      throw new BadRequestException('Supplier cost is required.');
    }
    if (!input.weightKg || input.weightKg <= 0) {
      throw new BadRequestException('Weight per unit is required.');
    }
    if (input.moq < 1) {
      throw new BadRequestException('MOQ must be at least 1.');
    }
    if (!input.leadTime.trim()) {
      throw new BadRequestException('Lead time is required.');
    }
    if (images.length < 2) {
      throw new BadRequestException('Upload at least 2 product photos.');
    }
    if (videos.length < 1) {
      throw new BadRequestException('Upload at least 1 product video.');
    }
    if (input.variations.length < 1) {
      throw new BadRequestException(
        'Add variations (or an explicit "None" row).',
      );
    }
  }

  private estimateDeliveryDays(leadTime: string) {
    const match = leadTime.match(/(\d+)/);
    if (!match) return 21;
    const n = Number(match[1]);
    if (!Number.isFinite(n) || n < 1) return 21;
    return Math.min(Math.max(Math.round(n), 1), 120);
  }

  private generateTempPassword() {
    return `Cp-${randomBytes(6).toString('base64url')}!9`;
  }

  private slugify(name: string) {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
  }
}
