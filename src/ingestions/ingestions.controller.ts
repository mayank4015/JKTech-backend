import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { IngestionsService } from './ingestions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Role } from '../auth/types/role.types';
import { CreateIngestionDto, IngestionFiltersDto } from './dto';

@Controller('ingestions')
@UseGuards(JwtAuthGuard, RoleGuard)
export class IngestionsController {
  constructor(private readonly ingestionsService: IngestionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createIngestion(
    @Body() createIngestionDto: CreateIngestionDto,
    @GetUser() user: User,
  ) {
    const ingestion = await this.ingestionsService.createIngestion(
      createIngestionDto,
      user.id,
    );

    return {
      success: true,
      data: ingestion,
      message: 'Ingestion created successfully',
    };
  }

  @Get()
  async getIngestions(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query() filters: IngestionFiltersDto,
    @GetUser() user: User,
  ) {
    const result = await this.ingestionsService.getIngestions(
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
  async getIngestionById(@Param('id') id: string, @GetUser() user: User) {
    const ingestion = await this.ingestionsService.getIngestionById(
      id,
      user.id,
      user.role,
    );

    return {
      success: true,
      data: ingestion,
    };
  }

  // Admin-only endpoints
  @Get('admin/all')
  @Roles(Role.ADMIN)
  async getAllIngestions(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query() filters: IngestionFiltersDto,
  ) {
    const result = await this.ingestionsService.getIngestions(
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
  async getAnyIngestionById(@Param('id') id: string) {
    const ingestion = await this.ingestionsService.getIngestionById(
      id,
      undefined,
      'admin',
    );

    return {
      success: true,
      data: ingestion,
    };
  }
}
