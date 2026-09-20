import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { OPS_PERMISSIONS } from '../../common/permissions';

const FEE_MODES = ['fixed', 'percent'] as const;
const MATCH_TYPES = ['exact', 'alternative'] as const;
const MEDIA_KINDS = ['image', 'video'] as const;

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
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  roleId: string;

  /** Required when inviting an Admin role: must equal CREATE_ADMIN */
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

export class SetAgentDisabledDto {
  @IsBoolean()
  disabled: boolean;
}

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn([...OPS_PERMISSIONS], { each: true })
  permissions: string[];
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn([...OPS_PERMISSIONS], { each: true })
  permissions?: string[];
}

export class UpdatePricingConfigDto {
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  shippingRatePerKg: number;

  @IsIn(FEE_MODES)
  agentFeeMode: (typeof FEE_MODES)[number];

  @Type(() => Number)
  @IsNumber()
  agentFeeValue: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  agentFeeMin?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  agentFeeMax?: number | null;

  @IsIn(FEE_MODES)
  miscMode: (typeof FEE_MODES)[number];

  @Type(() => Number)
  @IsNumber()
  miscValue: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  miscMin?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  miscMax?: number | null;

  @IsIn(FEE_MODES)
  profitMode: (typeof FEE_MODES)[number];

  @Type(() => Number)
  @IsNumber()
  profitValue: number;

  @Type(() => Number)
  @IsNumber()
  profitMin: number;

  @Type(() => Number)
  @IsNumber()
  profitMax: number;

  @IsOptional()
  @IsString()
  @MinLength(2)
  serviceLabel?: string;
}

export class FindMediaDto {
  @IsIn(MEDIA_KINDS)
  kind: (typeof MEDIA_KINDS)[number];

  @IsString()
  @MinLength(1)
  url: string;
}

export class FindVariationDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsArray()
  @IsString({ each: true })
  options: string[];
}

export class CreateProductFindDto {
  @IsIn(MATCH_TYPES)
  matchType: (typeof MATCH_TYPES)[number];

  @IsString()
  @MinLength(2)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FindVariationDto)
  variations?: FindVariationDto[];

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  supplierCost: number;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  weightKg: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  moq: number;

  @IsString()
  @MinLength(1)
  leadTime: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FindMediaDto)
  media: FindMediaDto[];

  @IsOptional()
  @IsBoolean()
  submitForReview?: boolean;
}

export class RejectProductFindDto {
  @IsOptional()
  @IsString()
  note?: string;
}
