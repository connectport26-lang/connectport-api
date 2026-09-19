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
  RequireOpsPermission,
} from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import {
  ActivityQueryDto,
  CreateOpsAgentDto,
  CreateProductFindDto,
  CreateRoleDto,
  CreateTeamDto,
  CustomerQueryDto,
  RejectProductFindDto,
  SetAgentDisabledDto,
  TeamMemberDto,
  UpdateMarketplaceDto,
  UpdatePricingConfigDto,
  UpdateRoleDto,
} from './dto/ops-console.dto';
import { OpsConsoleService } from './ops-console.service';

@Controller('ops')
@RequireOps()
export class OpsConsoleController {
  constructor(private readonly console: OpsConsoleService) {}

  @Get('customers')
  @RequireOpsPermission('customers.view')
  listCustomers(@Query() query: CustomerQueryDto) {
    return this.console.listCustomers(query.search);
  }

  @Get('activity')
  @RequireOpsPermission('activity.view')
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
  @RequireOpsPermission('teams.manage')
  listTeams() {
    return this.console.listTeams();
  }

  @Post('teams')
  @RequireOpsPermission('teams.manage')
  createTeam(@Body() body: CreateTeamDto) {
    return this.console.createTeam(body);
  }

  @Post('teams/:id/members')
  @RequireOpsPermission('teams.manage')
  addMember(@Param('id') id: string, @Body() body: TeamMemberDto) {
    return this.console.addTeamMember(id, body.opsUserId);
  }

  @Delete('teams/:id/members/:opsUserId')
  @RequireOpsPermission('teams.manage')
  removeMember(
    @Param('id') id: string,
    @Param('opsUserId') opsUserId: string,
  ) {
    return this.console.removeTeamMember(id, opsUserId);
  }

  @Get('roles')
  @RequireOpsPermission('roles.manage', 'agents.invite')
  listRoles() {
    return this.console.listRoles();
  }

  @Post('roles')
  @RequireOpsPermission('roles.manage')
  createRole(@Body() body: CreateRoleDto) {
    return this.console.createRole(body);
  }

  @Patch('roles/:id')
  @RequireOpsPermission('roles.manage')
  updateRole(@Param('id') id: string, @Body() body: UpdateRoleDto) {
    return this.console.updateRole(id, body);
  }

  @Post('agents')
  @RequireOpsPermission('agents.invite')
  createAgent(@Body() body: CreateOpsAgentDto) {
    return this.console.createAgent(body);
  }

  @Patch('agents/:id/disabled')
  @RequireOpsPermission('agents.invite')
  setAgentDisabled(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: SetAgentDisabledDto,
  ) {
    return this.console.setAgentDisabled(id, body.disabled, user.sub);
  }

  @Get('pricing-config')
  getPricingConfig() {
    return this.console.getPricingConfig();
  }

  @Post('pricing-config')
  @RequireOpsPermission('pricing.manage')
  updatePricingConfig(@Body() body: UpdatePricingConfigDto) {
    return this.console.updatePricingConfig(body);
  }

  @Post('pricing-config/preview')
  previewPricing(
    @Body()
    body: { supplierCost: number; quantity: number; weightKg: number },
  ) {
    return this.console.previewLandingPrice(body);
  }

  @Get('requests/:id/finds')
  @RequireOpsPermission('finds.submit', 'finds.approve')
  listFinds(@Param('id') id: string) {
    return this.console.listFinds(id);
  }

  @Post('requests/:id/finds')
  @RequireOpsPermission('finds.submit')
  createFind(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: CreateProductFindDto,
  ) {
    return this.console.createProductFind(id, user.sub, body);
  }

  @Post('requests/:id/finds/:findId/approve')
  @RequireOpsPermission('finds.approve')
  approveFind(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('findId') findId: string,
  ) {
    return this.console.approveProductFind(id, findId, user.sub);
  }

  @Post('requests/:id/finds/:findId/reject')
  @RequireOpsPermission('finds.approve')
  rejectFind(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('findId') findId: string,
    @Body() body: RejectProductFindDto,
  ) {
    return this.console.rejectProductFind(id, findId, user.sub, body);
  }
}
