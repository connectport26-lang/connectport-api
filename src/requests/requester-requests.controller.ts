import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RequireRequester } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { CreateGuidedRequestDto, CreateRequestDto } from './dto/requests.dto';
import { RequestsService } from './requests.service';

@Controller('me/requests')
@RequireRequester()
export class RequesterRequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  listMine(@CurrentUser() user: AuthUser) {
    return this.requests.listMyRequests(user.sub);
  }

  @Get(':id')
  getMine(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.requests.getMyRequest(user.sub, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateRequestDto) {
    return this.requests.createRequest(user.sub, body);
  }

  @Post('guided')
  createGuided(@CurrentUser() user: AuthUser, @Body() body: CreateGuidedRequestDto) {
    return this.requests.createGuidedRequest(user.sub, body);
  }

  @Post(':id/quotes/:quoteId/reject')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('quoteId') quoteId: string,
  ) {
    return this.requests.rejectQuote(user.sub, id, quoteId);
  }

  @Post(':id/quotes/:quoteId/approve')
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('quoteId') quoteId: string,
  ) {
    return this.requests.approveQuote(user.sub, id, quoteId);
  }

  @Post(':id/quotes/:quoteId/pay')
  pay(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('quoteId') quoteId: string,
  ) {
    return this.requests.payQuote(user.sub, id, quoteId);
  }
}
