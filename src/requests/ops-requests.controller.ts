import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RequireOps, RequireOpsPermission } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import {
  AssignRequestDto,
  CancelRequestDto,
  RequestFiltersDto,
  SubmitQuotesDto,
  UpdateStatusDto,
} from './dto/requests.dto';
import { RequestsService } from './requests.service';

@Controller('ops')
@RequireOps()
export class OpsRequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get('users')
  listOpsUsers() {
    return this.requests.listOpsUsers();
  }

  @Get('requests/stats')
  @RequireOpsPermission('queue.view')
  stats() {
    return this.requests.requestStats();
  }

  @Get('requests')
  @RequireOpsPermission('queue.view')
  list(@Query() filters: RequestFiltersDto) {
    return this.requests.listRequests(filters);
  }

  @Get('requests/:id')
  @RequireOpsPermission('queue.view')
  get(@Param('id') id: string) {
    return this.requests.getRequest(id);
  }

  @Post('requests/:id/claim')
  @RequireOpsPermission('queue.claim')
  claim(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.requests.claimRequest(id, user.sub);
  }

  @Post('requests/:id/assign')
  @RequireOpsPermission('queue.claim')
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: AssignRequestDto,
  ) {
    return this.requests.assignRequest(id, body.opsUserId, user.sub);
  }

  @Post('requests/:id/quotes')
  @RequireOpsPermission('finds.submit', 'catalog.manage')
  submitQuotes(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: SubmitQuotesDto,
  ) {
    return this.requests.submitQuotes(id, user.sub, body.drafts);
  }

  @Post('requests/:id/status')
  @RequireOpsPermission('queue.claim')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateStatusDto,
  ) {
    return this.requests.updateStatus(id, user.sub, body);
  }

  @Post('requests/:id/cancel')
  @RequireOpsPermission('queue.claim')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: CancelRequestDto,
  ) {
    return this.requests.cancelPaidRequest(id, user.sub, body);
  }

  @Post('requests/:id/refund/retry')
  @RequireOpsPermission('queue.claim')
  retryRefund(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.requests.retryRefund(id, user.sub);
  }
}
