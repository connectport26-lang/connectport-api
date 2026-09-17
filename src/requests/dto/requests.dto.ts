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
}
