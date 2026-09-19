import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateOpsAgentDto,
  CreateTeamDto,
  UpdateMarketplaceDto,
} from './dto/ops-console.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class OpsConsoleService {
  constructor(private readonly prisma: PrismaService) {}

  listCustomers(search?: string) {
    const q = search?.trim();
    return this.prisma.user.findMany({
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
    }).then((rows) =>
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
      ...(cursor
        ? { cursor: { id: cursor }, skip: 1 }
        : {}),
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

  async createAgent(input: CreateOpsAgentDto) {
    if (input.role === 'admin' && input.confirmStepUp !== 'CREATE_ADMIN') {
      throw new BadRequestException(
        'Creating an admin requires step-up confirmation (confirmStepUp=CREATE_ADMIN).',
      );
    }

    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.credential.findUnique({
      where: { email },
    });
    if (existing) {
      throw new BadRequestException('An account with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const opsUser = await this.prisma.opsUser.create({
      data: {
        name: input.name.trim(),
        email,
        role: input.role,
        credential: {
          create: {
            email,
            passwordHash,
            kind: 'ops',
          },
        },
      },
    });

    return {
      id: opsUser.id,
      name: opsUser.name,
      email: opsUser.email,
      role: opsUser.role,
      disabled: false,
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
      include: { credential: true },
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
      name: opsUser.name,
      email: opsUser.email,
      role: opsUser.role,
      disabled,
    };
  }

  listTeams() {
    return this.prisma.team.findMany({
      orderBy: { name: 'asc' },
      include: {
        members: {
          include: {
            opsUser: {
              select: { id: true, name: true, email: true, role: true },
            },
          },
        },
        _count: { select: { requests: true } },
      },
    }).then((teams) =>
      teams.map((team) => ({
        id: team.id,
        name: team.name,
        createdAt: team.createdAt.toISOString(),
        requestCount: team._count.requests,
        members: team.members.map((member) => member.opsUser),
      })),
    );
  }

  async createTeam(input: CreateTeamDto) {
    const team = await this.prisma.team.create({
      data: { name: input.name.trim() },
    });
    return { id: team.id, name: team.name, createdAt: team.createdAt.toISOString(), members: [], requestCount: 0 };
  }

  async addTeamMember(teamId: string, opsUserId: string) {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new NotFoundException('Team not found.');
    const opsUser = await this.prisma.opsUser.findUnique({
      where: { id: opsUserId },
    });
    if (!opsUser) throw new NotFoundException('Ops user not found.');

    await this.prisma.teamMember.upsert({
      where: {
        teamId_opsUserId: { teamId, opsUserId },
      },
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
}
