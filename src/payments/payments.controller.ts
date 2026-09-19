import {
  BadRequestException,
  Controller,
  Headers,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  Public,
  RequireRequester,
} from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('me/requests/:id/quotes/:quoteId/pay/initialize')
  @RequireRequester()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  initialize(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('quoteId') quoteId: string,
  ) {
    return this.payments.initialize(user.sub, id, quoteId);
  }

  @Post('me/payments/verify')
  @RequireRequester()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  verify(
    @CurrentUser() user: AuthUser,
    @Query('reference') reference: string,
  ) {
    if (!reference?.trim()) {
      throw new BadRequestException('Payment reference required.');
    }
    return this.payments.verifyReference(reference.trim(), user.sub);
  }

  @Post('webhooks/paystack')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature?: string,
  ) {
    if (!req.rawBody || !Buffer.isBuffer(req.rawBody)) {
      throw new BadRequestException(
        'Raw body required for webhook signature verification.',
      );
    }
    return this.payments.handleWebhook(req.rawBody, signature);
  }
}
