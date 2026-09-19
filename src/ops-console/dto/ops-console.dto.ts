import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class ActivityQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class CustomerQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}

export class CreateOpsAgentDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsIn(['admin', 'agent'])
  role: 'admin' | 'agent';

  /** Required when role is admin: must equal CREATE_ADMIN */
  @IsOptional()
  @IsString()
  confirmStepUp?: string;
}

export class CreateTeamDto {
  @IsString()
  @MinLength(2)
  name: string;
}

export class TeamMemberDto {
  @IsString()
  opsUserId: string;
}

export class UpdateMarketplaceDto {
  @IsBoolean()
  marketplaceEligible: boolean;
}
