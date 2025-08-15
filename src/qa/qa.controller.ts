import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { QAService } from './qa.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AskQuestionDto,
  CreateConversationDto,
  QAFiltersDto,
  SaveQADto,
} from './dto';

@Controller('qa')
@UseGuards(JwtAuthGuard)
export class QAController {
  constructor(private readonly qaService: QAService) {}

  @Post('ask')
  async askQuestion(@Request() req: any, @Body() dto: AskQuestionDto) {
    return this.qaService.askQuestion(req.user.sub, dto);
  }

  @Post('conversations')
  async createConversation(
    @Request() req: any,
    @Body() dto: CreateConversationDto,
  ) {
    return this.qaService.createConversation(req.user.sub, dto);
  }

  @Get('conversations')
  async getConversations(
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query() filters: QAFiltersDto,
  ) {
    return this.qaService.getConversations(req.user.sub, page, limit, filters);
  }

  @Get('conversations/:id')
  async getConversationById(@Request() req: any, @Param('id') id: string) {
    return this.qaService.getConversationById(id, req.user.sub);
  }

  @Put('conversations/:id')
  async updateConversation(
    @Request() req: any,
    @Param('id') id: string,
    @Body() updates: any,
  ) {
    return this.qaService.updateConversation(id, req.user.sub, updates);
  }

  @Delete('conversations/:id')
  async deleteConversation(@Request() req: any, @Param('id') id: string) {
    await this.qaService.deleteConversation(id, req.user.sub);
    return { message: 'Conversation deleted successfully' };
  }

  @Post('save')
  async saveQA(@Request() req: any, @Body() dto: SaveQADto) {
    return this.qaService.saveQA(req.user.sub, dto);
  }

  @Get('saved')
  async getSavedQAs(
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query() filters: QAFiltersDto,
  ) {
    return this.qaService.getSavedQAs(req.user.sub, page, limit, filters);
  }

  @Delete('saved/:id')
  async deleteSavedQA(@Request() req: any, @Param('id') id: string) {
    await this.qaService.deleteSavedQA(id, req.user.sub);
    return { message: 'Saved Q&A deleted successfully' };
  }

  @Get('search')
  async searchDocuments(
    @Request() req: any,
    @Query('q') query: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    if (!query) {
      return { sources: [], message: 'Query parameter is required' };
    }
    return this.qaService.searchDocuments(req.user.sub, query, limit);
  }
}
