import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async logOps(input: {
    opsUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
  }) {
    await this.prisma.opsAuditLog.create({
      data: {
        opsUserId: input.opsUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        beforeJson: input.before != null ? JSON.stringify(input.before) : null,
        afterJson: input.after != null ? JSON.stringify(input.after) : null,
      },
    });
  }
}
