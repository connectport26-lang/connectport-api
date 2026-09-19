import { Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import { MailModule } from '../mail/mail.module';
import { RedisService } from '../redis/redis.module';

import type { EmailDetailRow } from '../mail/mail.context';

export type EmailAttachment = {
  filename: string;
  /** Base64-encoded file content */
  content: string;
};

export type EmailJobPayload = {
  to: string;
  subject: string;
  headline: string;
  body: string;
  ctaLabel?: string;
  ctaPath?: string;
  code?: string;
  snippet?: string;
  details?: EmailDetailRow[];
  attachments?: EmailAttachment[];
};

const EMAIL_QUEUE_KEY = 'cp:queue:email';

@Injectable()
export class MailQueueService {
  private readonly logger = new Logger(MailQueueService.name);
  private workerTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly mail: MailService,
    private readonly redis: RedisService,
  ) {}

  /** Non-blocking email send (Redis list worker when available). */
  async enqueue(payload: EmailJobPayload): Promise<{ queued: boolean }> {
    if (this.redis.isRedis) {
      await this.redis.listPush(EMAIL_QUEUE_KEY, JSON.stringify(payload));
      return { queued: true };
    }

    setImmediate(() => {
      void this.mail.send(payload).catch((err) => {
        this.logger.error(
          `Inline email failed: ${err instanceof Error ? err.message : err}`,
        );
      });
    });
    return { queued: false };
  }

  startWorker() {
    if (this.workerTimer) return;
    this.workerTimer = setInterval(() => {
      void this.drainOnce();
    }, 400);
    this.logger.log(
      this.redis.isRedis
        ? 'Email queue worker started (Redis)'
        : 'Email inline worker started (no Redis)',
    );
  }

  private async drainOnce() {
    if (!this.redis.isRedis) return;
    try {
      const raw = await this.redis.listPop(EMAIL_QUEUE_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw) as EmailJobPayload;
      const result = await this.mail.send(payload);
      if (!result.delivered) {
        this.logger.warn(`Queued email not delivered to ${payload.to}`);
      }
    } catch (err) {
      this.logger.error(
        `Email worker error: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

@Injectable()
class EmailWorkerBootstrap implements OnModuleInit {
  constructor(private readonly queue: MailQueueService) {}

  onModuleInit() {
    this.queue.startWorker();
  }
}

@Module({
  imports: [MailModule, ConfigModule],
  providers: [MailQueueService, EmailWorkerBootstrap],
  exports: [MailQueueService],
})
export class QueueModule {}
