import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class AskQuestionDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;
}
