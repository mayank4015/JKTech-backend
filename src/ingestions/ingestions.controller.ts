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
  ParseUUIDPipe,
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
    @Query() allQuery: any,
    @GetUser() user: User,
  ) {
    // Extract filters by excluding pagination parameters
    const { page: _, limit: __, ...filters } = allQuery;
    const filtersDto = new IngestionFiltersDto();
    Object.assign(filtersDto, filters);

    const result = await this.ingestionsService.getIngestions(
      page,
      limit,
      filtersDto,
      user.id,
      user.role,
    );

    return {
      success: true,
      data: result,
    };
  }

  @Get('stats')
  async getIngestionStats(@GetUser() user: User) {
    const result = await this.ingestionsService.getIngestions(
      1,
      1,
      {},
      user.id,
      user.role,
    );

    return {
      success: true,
      data: result.stats,
    };
  }

  @Get(':id')
  async getIngestionById(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
  ) {
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
    @Query() allQuery: any,
  ) {
    // Extract filters by excluding pagination parameters
    const { page: _, limit: __, ...filters } = allQuery;
    const filtersDto = new IngestionFiltersDto();
    Object.assign(filtersDto, filters);

    const result = await this.ingestionsService.getIngestions(
      page,
      limit,
      filtersDto,
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
  async getAnyIngestionById(@Param('id', ParseUUIDPipe) id: string) {
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

  // Processing endpoints
  @Post(':id/process')
  @HttpCode(HttpStatus.OK)
  async triggerProcessing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() config: any,
    @GetUser() user: User,
  ) {
    const jobId = await this.ingestionsService.triggerDocumentProcessing(
      id,
      user.id,
    );

    return {
      success: true,
      data: { jobId },
      message: 'Processing started successfully',
    };
  }

  @Get(':id/status')
  async getProcessingStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
  ) {
    const status = await this.ingestionsService.getProcessingStatus(id);

    return {
      success: true,
      data: status,
    };
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelProcessing(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
  ) {
    const cancelled = await this.ingestionsService.cancelProcessing(
      id,
      user.id,
    );

    return {
      success: true,
      data: { cancelled },
      message: cancelled
        ? 'Processing cancelled successfully'
        : 'Failed to cancel processing',
    };
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  async retryProcessing(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
  ) {
    const jobId = await this.ingestionsService.triggerDocumentProcessing(
      id,
      user.id,
    );

    return {
      success: true,
      data: { jobId },
      message: 'Processing restarted successfully',
    };
  }
}
