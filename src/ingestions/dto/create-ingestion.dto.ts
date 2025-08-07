import { IsUUID, IsOptional, IsObject } from 'class-validator';

export class CreateIngestionDto {
  @IsUUID()
  documentId: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}
