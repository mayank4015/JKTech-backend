import {
  IsOptional,
  IsString,
  IsEnum,
  IsArray,
  IsUUID,
  IsDateString,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum DocumentStatus {
  PENDING = 'pending',
  PROCESSED = 'processed',
  FAILED = 'failed',
}

export enum DocumentSortBy {
  TITLE = 'title',
  CREATED_AT = 'createdAt',
  FILE_SIZE = 'fileSize',
  STATUS = 'status',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class DocumentFiltersDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map((tag: string) => tag.trim());
    }
    return value;
  })
  tags?: string[];

  @IsOptional()
  @IsUUID()
  uploadedBy?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(DocumentSortBy)
  sortBy?: DocumentSortBy;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder;
}
