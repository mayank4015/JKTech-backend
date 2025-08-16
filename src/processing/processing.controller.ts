import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  UnauthorizedException,
  BadRequestException,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IngestionsService } from '../ingestions/ingestions.service';
import { ProcessingQueueService } from '../common/queues/processing-queue.service';
import { AppConfigService } from '../config/app-config.service';
import { LoggerService } from '../common/logger/logger.service';

interface ProcessingCallbackDto {
  documentId: string;
  result: {
    success: boolean;
    processingTime: number;
    extractedText?: string;
    ocrText?: string;
    keywords?: string[];
    summary?: string;
    language?: string;
    errors?: string[];
  };
}

@Controller('api/v1/processing')
export class ProcessingController {
  private readonly logger = new Logger(ProcessingController.name);

  constructor(
    private readonly ingestionsService: IngestionsService,
    private readonly processingQueue: ProcessingQueueService,
    private readonly configService: AppConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  @Public()
  @Post('callback')
  async handleProcessingCallback(
    @Body() callbackData: ProcessingCallbackDto,
    @Headers('x-service-token') serviceToken: string,
  ): Promise<{ success: boolean; message: string }> {
    // Verify service token
    const expectedToken = this.configService.getServiceToken();

    if (!serviceToken || serviceToken !== expectedToken) {
      this.logger.warn(
        `Unauthorized processing callback attempt for document ${callbackData.documentId}`,
      );
      throw new UnauthorizedException('Invalid service token');
    }

    try {
      this.logger.log(
        `Processing callback received for document ${callbackData.documentId}`,
      );

      // Find the ingestion by document ID
      const ingestions = await this.ingestionsService.getIngestions(1, 1, {
        documentId: callbackData.documentId,
      });

      if (ingestions.ingestions.length === 0) {
        throw new BadRequestException(
          `No ingestion found for document ${callbackData.documentId}`,
        );
      }

      const ingestion = ingestions.ingestions[0];
      const { result } = callbackData;

      if (result.success) {
        // Update ingestion as completed
        await this.ingestionsService.updateIngestionStatus(
          ingestion.id,
          'completed' as any,
          100,
          undefined,
          {
            ...(typeof ingestion.logs === 'object' && ingestion.logs !== null
              ? ingestion.logs
              : {}),
            processingResult: result,
            completedAt: new Date().toISOString(),
          },
        );

        this.logger.log(
          `Processing completed successfully for document ${callbackData.documentId}`,
        );
      } else {
        // Update ingestion as failed
        await this.ingestionsService.updateIngestionStatus(
          ingestion.id,
          'failed' as any,
          ingestion.progress,
          result.errors?.join('; ') || 'Processing failed',
          {
            ...(typeof ingestion.logs === 'object' && ingestion.logs !== null
              ? ingestion.logs
              : {}),
            processingResult: result,
            failedAt: new Date().toISOString(),
          },
        );

        this.logger.error(
          `Processing failed for document ${callbackData.documentId}: ${result.errors?.join('; ')}`,
        );
      }

      return {
        success: true,
        message: 'Callback processed successfully',
      };
    } catch (error) {
      this.logger.error(
        `Failed to process callback for document ${callbackData.documentId}:`,
        error.stack,
      );

      throw new BadRequestException(
        `Failed to process callback: ${error.message}`,
      );
    }
  }

  @Get('queue/stats')
  @UseGuards(JwtAuthGuard)
  async getQueueStats(): Promise<{
    success: boolean;
    data: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
      paused: number;
    };
  }> {
    try {
      const stats = await this.processingQueue.getQueueStats();

      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      this.logger.error('Failed to get queue stats:', error.stack);
      throw new BadRequestException('Failed to get queue statistics');
    }
  }
}
