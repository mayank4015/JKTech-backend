import { IsUUID, IsOptional, IsString, IsArray } from 'class-validator';

export class SaveQADto {
  @IsUUID()
  questionId: string;

  @IsUUID()
  answerId: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
