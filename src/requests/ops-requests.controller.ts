import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RequireOps } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import {
  AssignRequestDto,
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
  stats() {
    return this.requests.requestStats();
  }

  @Get('requests')
  list(@Query() filters: RequestFiltersDto) {
    return this.requests.listRequests(filters);
  }

  @Get('requests/:id')
  get(@Param('id') id: string) {
    return this.requests.getRequest(id);
  }

  @Post('requests/:id/claim')
  claim(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.requests.claimRequest(id, user.sub);
  }

  @Post('requests/:id/assign')
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: AssignRequestDto,
  ) {
    return this.requests.assignRequest(id, body.opsUserId, user.sub);
  }

  @Post('requests/:id/quotes')
  submitQuotes(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: SubmitQuotesDto,
  ) {
    return this.requests.submitQuotes(id, user.sub, body.drafts);
  }

  @Post('requests/:id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateStatusDto,
  ) {
    return this.requests.updateStatus(id, user.sub, body);
  }
}
