import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { User } from '@prisma/client';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Role } from '../auth/types/role.types';
import {
  CreateDocumentDto,
  UpdateDocumentDto,
  DocumentFiltersDto,
} from './dto';

@Controller('documents')
@UseGuards(JwtAuthGuard, RoleGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body() createDocumentDto: CreateDocumentDto,
    @GetUser() user: User,
  ) {
    if (!file) {
      throw new Error('File is required');
    }

    const document = await this.documentsService.uploadDocument(
      file,
      createDocumentDto,
      user.id,
    );

    return {
      success: true,
      data: document,
      message: 'Document uploaded successfully and queued for processing',
    };
  }

  @Get()
  async getDocuments(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query() filters: DocumentFiltersDto,
    @GetUser() user: User,
  ) {
    const result = await this.documentsService.getDocuments(
      page,
      limit,
      filters,
      user.id,
      user.role,
    );

    return {
      success: true,
      data: result,
    };
  }

  @Get(':id')
  async getDocumentById(@Param('id') id: string, @GetUser() user: User) {
    const document = await this.documentsService.getDocumentById(
      id,
      user.id,
      user.role,
    );

    return {
      success: true,
      data: document,
    };
  }

  @Patch(':id')
  async updateDocument(
    @Param('id') id: string,
    @Body() updateDocumentDto: UpdateDocumentDto,
    @GetUser() user: User,
  ) {
    const document = await this.documentsService.updateDocument(
      id,
      updateDocumentDto,
      user.id,
      user.role,
    );

    return {
      success: true,
      data: document,
      message: 'Document updated successfully',
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteDocument(@Param('id') id: string, @GetUser() user: User) {
    await this.documentsService.deleteDocument(id, user.id, user.role);

    return {
      success: true,
      message: 'Document deleted successfully',
    };
  }

  @Post(':id/reprocess')
  async reprocessDocument(@Param('id') id: string, @GetUser() user: User) {
    const result = await this.documentsService.reprocessDocument(
      id,
      user.id,
      user.role,
    );

    return {
      success: true,
      data: {
        id: result.document.id,
        status: result.document.status,
        ingestionId: result.ingestionId,
      },
      message: 'Document queued for reprocessing',
    };
  }

  // Admin-only endpoints
  @Get('admin/all')
  @Roles(Role.ADMIN)
  async getAllDocuments(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query() filters: DocumentFiltersDto,
  ) {
    const result = await this.documentsService.getDocuments(
      page,
      limit,
      filters,
      undefined,
      'admin',
    );

    return {
      success: true,
      data: result,
    };
  }

  @Get('admin/:id')
  @Roles(Role.ADMIN)
  async getAnyDocumentById(@Param('id') id: string) {
    const document = await this.documentsService.getDocumentById(
      id,
      undefined,
      'admin',
    );

    return {
      success: true,
      data: document,
    };
  }

  @Delete('admin/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async deleteAnyDocument(@Param('id') id: string) {
    await this.documentsService.deleteDocument(id, undefined, 'admin');

    return {
      success: true,
      message: 'Document deleted successfully',
    };
  }
}
