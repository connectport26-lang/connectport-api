import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailQueueService } from '../queue/queue.module';
import { PrismaService } from '../prisma/prisma.service';

export type FindReviewNotifyPayload = {
  requestId: string;
  reference: string;
  findId: string;
  findTitle: string;
  matchType: string;
  agentName: string;
  agentEmail: string;
  landingTotal: number;
};

@Injectable()
export class OpsNotifyService {
  private readonly logger = new Logger(OpsNotifyService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mailQueue: MailQueueService,
  ) {}

  /** Fire-and-forget style: never throws to the caller. */
  async notifyFindPendingReview(payload: FindReviewNotifyPayload) {
    try {
      await Promise.allSettled([
        this.notifyEmail(payload),
        this.notifyDiscord(payload),
        this.notifyTelegram(payload),
      ]);
    } catch (err) {
      this.logger.warn(
        `Find review notify failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private reviewUrl(requestId: string) {
    const appUrl = (
      this.config.get<string>('APP_URL')?.trim() || 'http://localhost:3000'
    ).replace(/\/$/, '');
    return `${appUrl}/ops/queue/${requestId}`;
  }

  private summary(payload: FindReviewNotifyPayload) {
    const total = `₦${payload.landingTotal.toLocaleString('en-NG')}`;
    return {
      title: `Find ready for review: ${payload.reference}`,
      body: [
        `${payload.agentName || payload.agentEmail} submitted a ${payload.matchType} find.`,
        `Option: ${payload.findTitle}`,
        `Customer landing total: ${total}`,
        `Review: ${this.reviewUrl(payload.requestId)}`,
      ].join('\n'),
      url: this.reviewUrl(payload.requestId),
      total,
    };
  }

  private async reviewerEmails(): Promise<string[]> {
    const configured = this.config.get<string>('OPS_REVIEW_EMAILS')?.trim();
    if (configured) {
      return configured
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    }

    const roles = await this.prisma.role.findMany({
      where: { permissions: { has: 'finds.approve' } },
      select: { id: true },
    });
    if (!roles.length) return [];
    const users = await this.prisma.opsUser.findMany({
      where: {
        roleId: { in: roles.map((r) => r.id) },
        credential: { disabled: false },
      },
      select: { email: true },
    });
    return users.map((u) => u.email);
  }

  private async notifyEmail(payload: FindReviewNotifyPayload) {
    const emails = await this.reviewerEmails();
    if (!emails.length) {
      this.logger.debug('No OPS_REVIEW_EMAILS or finds.approve users; skip email.');
      return;
    }
    const s = this.summary(payload);
    await Promise.all(
      emails.map((to) =>
        this.mailQueue.enqueue({
          to,
          subject: s.title,
          headline: 'Sourcing find needs review',
          body: s.body,
          ctaLabel: 'Open in ops',
          ctaPath: `/ops/queue/${payload.requestId}`,
          details: [
            { label: 'Request', value: payload.reference },
            { label: 'Option', value: payload.findTitle },
            { label: 'Agent', value: payload.agentName || payload.agentEmail },
            { label: 'Landed total', value: s.total },
          ],
        }),
      ),
    );
  }

  private async notifyDiscord(payload: FindReviewNotifyPayload) {
    const webhook = this.config.get<string>('DISCORD_OPS_WEBHOOK_URL')?.trim();
    if (!webhook) {
      this.logger.debug('DISCORD_OPS_WEBHOOK_URL unset; skip Discord.');
      return;
    }
    const s = this.summary(payload);
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: null,
        embeds: [
          {
            title: s.title,
            description: s.body,
            url: s.url,
            color: 0x1a5f4a,
          },
        ],
      }),
    });
    if (!res.ok) {
      this.logger.warn(`Discord webhook failed: ${res.status}`);
    }
  }

  private async notifyTelegram(payload: FindReviewNotifyPayload) {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN')?.trim();
    const chatId = this.config.get<string>('TELEGRAM_OPS_CHAT_ID')?.trim();
    if (!token || !chatId) {
      this.logger.debug('Telegram env unset; skip Telegram.');
      return;
    }
    const s = this.summary(payload);
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `${s.title}\n\n${s.body}`,
          disable_web_page_preview: false,
        }),
      },
    );
    if (!res.ok) {
      this.logger.warn(`Telegram send failed: ${res.status}`);
    }
  }
}
