import { IsUUID, IsOptional, IsObject } from 'class-validator';
import { IngestionConfig } from '../ingestions.service';

export class CreateIngestionDto {
  @IsUUID()
  documentId: string;

  @IsOptional()
  @IsObject()
  config?: IngestionConfig;
}
