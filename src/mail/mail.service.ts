import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { brandedEmailHtml } from './mail.template';
import type { EmailDetailRow } from './mail.context';
import type { EmailAttachment } from '../queue/queue.module';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string>('RESEND_API_KEY')?.trim();
    this.resend = key ? new Resend(key) : null;
    this.from =
      this.config.get<string>('MAIL_FROM')?.trim() ||
      'ConnectPort <onboarding@resend.dev>';
    this.appUrl =
      this.config.get<string>('APP_URL')?.trim() || 'http://localhost:3000';
  }

  isConfigured() {
    return Boolean(this.resend);
  }

  async send(input: {
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
  }) {
    if (!this.resend) {
      this.logger.warn(
        `Email not sent (no RESEND_API_KEY): ${input.subject} → [redacted]` +
          (input.code ? ' | code=[redacted]' : ''),
      );
      return { delivered: false as const };
    }

    const ctaUrl = input.ctaPath
      ? `${this.appUrl.replace(/\/$/, '')}${input.ctaPath.startsWith('/') ? input.ctaPath : `/${input.ctaPath}`}`
      : undefined;

    try {
      await this.resend.emails.send({
        from: this.from,
        to: input.to,
        subject: input.subject,
        html: brandedEmailHtml({
          headline: input.headline,
          body: input.body,
          ctaLabel: input.ctaLabel,
          ctaUrl,
          code: input.code,
          snippet: input.snippet,
          details: input.details,
        }),
        attachments: input.attachments?.map((file) => ({
          filename: file.filename,
          content: Buffer.from(file.content, 'base64'),
        })),
      });
      return { delivered: true as const };
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${input.to}`,
        error instanceof Error ? error.stack : String(error),
      );
      return { delivered: false as const };
    }
  }
}
