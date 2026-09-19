import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const SOURCE_TYPES = ['link', 'photo', 'text'] as const;
const FLEXIBILITY = ['exact', 'flexible'] as const;
const BUDGET_SCOPES = ['per_unit', 'total'] as const;
const NEED_BY_KINDS = ['specific_date', 'timeframe', 'flexible'] as const;
const REFERENCE_KINDS = ['link', 'image'] as const;
const REQUEST_STATUSES = [
  'submitted',
  'quoted',
  'approved_paid',
  'procured',
  'in_transit_china_warehouse',
  'in_transit_freight',
  'arrived_nigeria_warehouse',
  'delivered',
] as const;

export class CreateRequestDto {
  @IsIn(SOURCE_TYPES)
  sourceType: (typeof SOURCE_TYPES)[number];

  @IsString()
  sourceValue: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity: number;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  budgetMax: number;

  @IsString()
  @MinLength(2)
  timeline: string;

  @IsString()
  @MinLength(8)
  qualityNotes: string;

  @IsIn(FLEXIBILITY)
  flexibility: (typeof FLEXIBILITY)[number];
}

export class GuidedReferenceDto {
  @IsIn(REFERENCE_KINDS)
  kind: (typeof REFERENCE_KINDS)[number];

  @IsString()
  @MinLength(1)
  value: string;
}

export class CreateGuidedRequestDto {
  @IsString()
  @MinLength(2)
  productName: string;

  @IsOptional()
  @IsString()
  productDescription?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GuidedReferenceDto)
  references: GuidedReferenceDto[];

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity: number;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  budgetMax: number;

  @IsIn(BUDGET_SCOPES)
  budgetScope: (typeof BUDGET_SCOPES)[number];

  @IsIn(NEED_BY_KINDS)
  needByKind: (typeof NEED_BY_KINDS)[number];

  @IsOptional()
  @IsString()
  needByDate?: string;

  @IsOptional()
  @IsString()
  needByTimeframe?: string;

  @IsOptional()
  @IsString()
  qualityNotes?: string;

  @IsIn(FLEXIBILITY)
  flexibility: (typeof FLEXIBILITY)[number];

  @IsOptional()
  @IsString()
  preferredProductId?: string;
}

export class QuoteDraftDto {
  @IsString()
  supplierRef: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  unitPrice: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  moq: number;

  @Type(() => Number)
  @IsNumber()
  productCost: number;

  @Type(() => Number)
  @IsNumber()
  freightEstimate: number;

  @Type(() => Number)
  @IsNumber()
  serviceFee: number;

  @IsString()
  leadTime: string;

  @IsBoolean()
  isAlternative: boolean;
}

export class SubmitQuotesDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one quote.' })
  @ValidateNested({ each: true })
  @Type(() => QuoteDraftDto)
  drafts: QuoteDraftDto[];
}

export class AssignRequestDto {
  @IsString()
  opsUserId: string;
}

export class UpdateStatusDto {
  @IsIn(REQUEST_STATUSES)
  status: (typeof REQUEST_STATUSES)[number];

  @IsString()
  note: string;
}

export class RequestFiltersDto {
  @IsOptional()
  @IsIn([...REQUEST_STATUSES, 'all'])
  status?: (typeof REQUEST_STATUSES)[number] | 'all';

  @IsOptional()
  @IsString()
  search?: string;

  /** Ops user id, or the literal "unassigned". */
  @IsOptional()
  @IsString()
  assignee?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
