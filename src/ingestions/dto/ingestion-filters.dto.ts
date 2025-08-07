import {
  IsOptional,
  IsString,
  IsEnum,
  IsUUID,
  IsDateString,
} from 'class-validator';

export enum IngestionStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum IngestionSortBy {
  STARTED_AT = 'startedAt',
  COMPLETED_AT = 'completedAt',
  STATUS = 'status',
  CREATED_AT = 'createdAt',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class IngestionFiltersDto {
  @IsOptional()
  @IsEnum(IngestionStatus)
  status?: IngestionStatus;

  @IsOptional()
  @IsUUID()
  documentId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(IngestionSortBy)
  sortBy?: IngestionSortBy;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder;
}
