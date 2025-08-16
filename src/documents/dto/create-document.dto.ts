import {
  IsString,
  IsOptional,
  IsArray,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { IsHtml, SkipSanitize } from '../../sanitization/decorators';

export class CreateDocumentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title: string;

  @IsOptional()
  @IsString()
  @IsHtml() // Rich HTML content - sanitized with allowlist
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value.split(',').map((tag: string) => tag.trim());
      }
    }
    return value;
  })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;
}
