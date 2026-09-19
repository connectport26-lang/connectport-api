import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  RequireOps,
  RequireOpsAdmin,
} from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import {
  ActivityQueryDto,
  CreateOpsAgentDto,
  CreateTeamDto,
  CustomerQueryDto,
  SetAgentDisabledDto,
  TeamMemberDto,
  UpdateMarketplaceDto,
} from './dto/ops-console.dto';
import { OpsConsoleService } from './ops-console.service';

@Controller('ops')
@RequireOps()
export class OpsConsoleController {
  constructor(private readonly console: OpsConsoleService) {}

  @Get('customers')
  listCustomers(@Query() query: CustomerQueryDto) {
    return this.console.listCustomers(query.search);
  }

  @Get('activity')
  listActivity(@Query() query: ActivityQueryDto) {
    return this.console.listActivity(query.limit, query.cursor);
  }

  @Get('reviews')
  listReviews() {
    return this.console.listReviews();
  }

  @Patch('requests/:id/marketplace')
  setMarketplace(
    @Param('id') id: string,
    @Body() body: UpdateMarketplaceDto,
  ) {
    return this.console.setMarketplaceEligible(id, body);
  }

  @Get('teams')
  listTeams() {
    return this.console.listTeams();
  }

  @Post('teams')
  @RequireOpsAdmin()
  createTeam(@Body() body: CreateTeamDto) {
    return this.console.createTeam(body);
  }

  @Post('teams/:id/members')
  @RequireOpsAdmin()
  addMember(@Param('id') id: string, @Body() body: TeamMemberDto) {
    return this.console.addTeamMember(id, body.opsUserId);
  }

  @Delete('teams/:id/members/:opsUserId')
  @RequireOpsAdmin()
  removeMember(
    @Param('id') id: string,
    @Param('opsUserId') opsUserId: string,
  ) {
    return this.console.removeTeamMember(id, opsUserId);
  }

  @Post('agents')
  @RequireOpsAdmin()
  createAgent(@Body() body: CreateOpsAgentDto) {
    return this.console.createAgent(body);
  }

  @Patch('agents/:id/disabled')
  @RequireOpsAdmin()
  setAgentDisabled(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: SetAgentDisabledDto,
  ) {
    return this.console.setAgentDisabled(id, body.disabled, user.sub);
  }
}
