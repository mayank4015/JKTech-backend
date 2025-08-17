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
    return this.qaService.askQuestion(req.user.id, req.user.role, dto);
  }

  @Post('conversations')
  async createConversation(
    @Request() req: any,
    @Body() dto: CreateConversationDto,
  ) {
    return this.qaService.createConversation(req.user.id, dto);
  }

  @Get('conversations')
  async getConversations(
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query() filters: QAFiltersDto,
  ) {
    return this.qaService.getConversations(req.user.id, page, limit, filters);
  }

  @Get('conversations/:id')
  async getConversationById(@Request() req: any, @Param('id') id: string) {
    return this.qaService.getConversationById(id, req.user.id);
  }

  @Put('conversations/:id')
  async updateConversation(
    @Request() req: any,
    @Param('id') id: string,
    @Body() updates: any,
  ) {
    return this.qaService.updateConversation(id, req.user.id, updates);
  }

  @Delete('conversations/:id')
  async deleteConversation(@Request() req: any, @Param('id') id: string) {
    await this.qaService.deleteConversation(id, req.user.id);
    return { message: 'Conversation deleted successfully' };
  }

  @Post('save')
  async saveQA(@Request() req: any, @Body() dto: SaveQADto) {
    return this.qaService.saveQA(req.user.id, dto);
  }

  @Get('saved')
  async getSavedQAs(
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query() filters: QAFiltersDto,
  ) {
    return this.qaService.getSavedQAs(req.user.id, page, limit, filters);
  }

  @Delete('saved/:id')
  async deleteSavedQA(@Request() req: any, @Param('id') id: string) {
    await this.qaService.deleteSavedQA(id, req.user.id);
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
    return this.qaService.searchDocuments(
      req.user.id,
      req.user.role,
      query,
      limit,
    );
  }

  @Get('stats')
  async getStats(@Request() req: any) {
    return this.qaService.getStats(req.user.id);
  }
}
