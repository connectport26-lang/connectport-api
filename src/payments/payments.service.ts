import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { isProduction } from '../common/prod-guard';
import { PrismaService } from '../prisma/prisma.service';
import { RequestsService } from '../requests/requests.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly requests: RequestsService,
  ) {}

  isPaystackConfigured() {
    return Boolean(this.config.get<string>('PAYSTACK_SECRET_KEY')?.trim());
  }

  async initialize(
    userId: string,
    requestId: string,
    quoteId: string,
  ): Promise<{
    mode: 'paystack' | 'demo';
    authorizationUrl?: string;
    reference?: string;
    detail?: unknown;
  }> {
    if (!this.isPaystackConfigured()) {
      if (isProduction(this.config)) {
        throw new ServiceUnavailableException(
          'Payments are temporarily unavailable.',
        );
      }
      const detail = await this.requests.payQuote(userId, requestId, quoteId);
      return { mode: 'demo', detail };
    }

    const detail = await this.requests.getMyRequest(userId, requestId);
    const quote = detail.quotes.find((q) => q.id === quoteId);
    if (!quote) throw new NotFoundException('Quote not found.');
    if (quote.status === 'rejected') {
      throw new BadRequestException('This quote was rejected.');
    }
    if (detail.request.status === 'approved_paid') {
      return { mode: 'paystack', detail };
    }
    if (detail.request.status === 'cancelled') {
      throw new BadRequestException('This order was cancelled.');
    }
    if (detail.request.status !== 'quoted') {
      throw new BadRequestException('This quote can no longer be paid.');
    }

    const secret = this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY').trim();
    const amountKobo = Math.round(Number(quote.totalCost) * 100);
    const reference = `cp_${requestId.slice(-8)}_${quoteId.slice(-8)}_${Date.now()}`;
    const callbackUrl =
      this.config.get<string>('PAYSTACK_CALLBACK_URL')?.trim() ||
      `${(this.config.get<string>('APP_URL') || 'http://localhost:3000').replace(/\/$/, '')}${
        detail.request.channel === 'catalog'
          ? `/orders/${requestId}`
          : `/quotes/${quoteId}`
      }`;

    const response = await fetch(
      'https://api.paystack.co/transaction/initialize',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: detail.user.email,
          amount: amountKobo,
          currency: 'NGN',
          reference,
          callback_url: callbackUrl,
          metadata: { requestId, quoteId, userId },
        }),
      },
    );

    const json = (await response.json()) as {
      status?: boolean;
      message?: string;
      data?: { authorization_url?: string; reference?: string };
    };

    if (!response.ok || !json.status || !json.data?.authorization_url) {
      throw new BadRequestException(
        json.message || 'Could not start checkout. Try again.',
      );
    }

    await this.prisma.payment.upsert({
      where: { requestId },
      create: {
        requestId,
        amount: quote.totalCost,
        gateway: 'paystack',
        gatewayRef: json.data.reference || reference,
        status: 'unpaid',
      },
      update: {
        amount: quote.totalCost,
        gateway: 'paystack',
        gatewayRef: json.data.reference || reference,
        status: 'unpaid',
      },
    });

    return {
      mode: 'paystack',
      authorizationUrl: json.data.authorization_url,
      reference: json.data.reference || reference,
    };
  }

  async verifyReference(reference: string, callerUserId: string) {
    const secret = this.config.get<string>('PAYSTACK_SECRET_KEY')?.trim();
    if (!secret) {
      throw new BadRequestException('Payments are temporarily unavailable.');
    }

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    const json = (await response.json()) as {
      status?: boolean;
      data?: {
        status?: string;
        amount?: number;
        currency?: string;
        reference?: string;
        metadata?: { requestId?: string; quoteId?: string; userId?: string };
      };
    };

    if (!json.status || json.data?.status !== 'success') {
      throw new BadRequestException('Payment not successful yet.');
    }

    const meta = json.data.metadata || {};
    if (!meta.requestId || !meta.quoteId || !meta.userId) {
      throw new BadRequestException('Payment metadata incomplete.');
    }

    if (meta.userId !== callerUserId) {
      throw new NotFoundException('Payment not found.');
    }

    return this.requests.completePaystackPayment(
      meta.userId,
      meta.requestId,
      meta.quoteId,
      json.data.reference || reference,
      json.data.amount,
      json.data.currency,
    );
  }

  async handleWebhook(rawBody: Buffer, signature: string | undefined) {
    const secret = this.config.get<string>('PAYSTACK_SECRET_KEY')?.trim();
    if (!secret) {
      this.logger.warn('Paystack webhook received but secret missing');
      throw new ServiceUnavailableException('Paystack is not configured.');
    }

    if (!signature) {
      throw new BadRequestException('Missing Paystack signature.');
    }

    const hash = createHmac('sha512', secret).update(rawBody).digest('hex');
    const a = Buffer.from(hash);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new BadRequestException('Invalid Paystack signature.');
    }

    const payload = JSON.parse(rawBody.toString('utf8')) as {
      event?: string;
      data?: {
        reference?: string;
        status?: string;
        amount?: number;
        currency?: string;
        metadata?: { requestId?: string; quoteId?: string; userId?: string };
      };
    };

    if (payload.event !== 'charge.success' || payload.data?.status !== 'success') {
      return { received: true };
    }

    const meta = payload.data?.metadata || {};
    const reference = payload.data?.reference;
    if (!meta.requestId || !meta.quoteId || !meta.userId || !reference) {
      this.logger.warn('Paystack webhook missing metadata');
      return { received: true };
    }

    await this.requests.completePaystackPayment(
      meta.userId,
      meta.requestId,
      meta.quoteId,
      reference,
      payload.data?.amount,
      payload.data?.currency,
    );
    return { received: true };
  }
}
