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

const STATUSES = ['draft', 'verified', 'published', 'archived'] as const;
const AVAILABILITY = ['in_stock', 'made_to_order', 'limited'] as const;
const MEDIA_KINDS = ['image', 'video'] as const;

export class ProductMediaItemDto {
  @IsIn(MEDIA_KINDS)
  kind: (typeof MEDIA_KINDS)[number];

  @IsString()
  @MinLength(4)
  url: string;
}

export class ProductQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn([...STATUSES, 'all'])
  status?: (typeof STATUSES)[number] | 'all';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class CreateProductDto {
  @IsString()
  @MinLength(2)
  slug: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(8)
  description: string;

  @IsString()
  @MinLength(4)
  imageUrl: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductMediaItemDto)
  media?: ProductMediaItemDto[];

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
  @IsPositive()
  weightKg: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedDeliveryDays: number;

  @IsIn(AVAILABILITY)
  availability: (typeof AVAILABILITY)[number];

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @IsOptional()
  @IsBoolean()
  featuredOnLanding?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  landingSort?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  sourceRequestId?: string;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  description?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  imageUrl?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductMediaItemDto)
  media?: ProductMediaItemDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  unitPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  moq?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  weightKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedDeliveryDays?: number;

  @IsOptional()
  @IsIn(AVAILABILITY)
  availability?: (typeof AVAILABILITY)[number];

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @IsOptional()
  @IsBoolean()
  featuredOnLanding?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  landingSort?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  sourceRequestId?: string;
}

export class BulkProductStatusDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  ids: string[];

  @IsIn(STATUSES)
  status: (typeof STATUSES)[number];
}
