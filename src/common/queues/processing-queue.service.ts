import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { AppConfigService } from '../../config/app-config.service';

export interface DocumentProcessingJobData {
  documentId: string;
  fileName: string;
  fileType: string;
  filePath: string;
  userId: string;
  config: {
    extractText?: boolean;
    performOCR?: boolean;
    extractKeywords?: boolean;
    generateSummary?: boolean;
    detectLanguage?: boolean;
    enableSearch?: boolean;
  };
}

export interface JobStatus {
  id: string;
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused';
  progress: number;
  data: DocumentProcessingJobData;
  result?: any;
  error?: string;
  createdAt: Date;
  processedAt?: Date;
  finishedAt?: Date;
}

@Injectable()
export class ProcessingQueueService {
  private readonly logger = new Logger(ProcessingQueueService.name);

  constructor(
    @InjectQueue('document-processing') private readonly processingQueue: Queue,
    private readonly configService: AppConfigService,
  ) {}

  async addProcessingJob(
    jobData: DocumentProcessingJobData,
    options?: {
      priority?: number;
      delay?: number;
      attempts?: number;
      backoff?: { type: string; delay: number };
    },
  ): Promise<Job<DocumentProcessingJobData>> {
    try {
      const job = await this.processingQueue.add('process-document', jobData, {
        priority: options?.priority || 0,
        delay: options?.delay || 0,
        attempts: options?.attempts || 3,
        backoff: options?.backoff || {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 50, // Keep last 50 completed jobs
        removeOnFail: 100, // Keep last 100 failed jobs
      });

      this.logger.log(
        `Added processing job for document ${jobData.documentId} with job ID: ${job.id}`,
      );

      return job;
    } catch (error) {
      this.logger.error(
        `Failed to add processing job for document ${jobData.documentId}:`,
        error.stack,
      );
      throw error;
    }
  }

  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    try {
      const job = await this.processingQueue.getJob(jobId);
      if (!job) {
        return null;
      }

      const state = await job.getState();
      const progress = job.progress();

      return {
        id: job.id.toString(),
        status: state as JobStatus['status'],
        progress: typeof progress === 'number' ? progress : 0,
        data: job.data,
        result: job.returnvalue,
        error: job.failedReason,
        createdAt: new Date(job.timestamp),
        processedAt: job.processedOn ? new Date(job.processedOn) : undefined,
        finishedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get job status for job ${jobId}:`,
        error.stack,
      );
      return null;
    }
  }

  async getJobsByDocument(documentId: string): Promise<JobStatus[]> {
    try {
      const jobs = await this.processingQueue.getJobs([
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
        'paused',
      ]);

      const documentJobs = jobs.filter(
        (job) => job.data.documentId === documentId,
      );

      const jobStatuses = await Promise.all(
        documentJobs.map(async (job) => {
          const state = await job.getState();
          const progress = job.progress();

          return {
            id: job.id.toString(),
            status: state as JobStatus['status'],
            progress: typeof progress === 'number' ? progress : 0,
            data: job.data,
            result: job.returnvalue,
            error: job.failedReason,
            createdAt: new Date(job.timestamp),
            processedAt: job.processedOn
              ? new Date(job.processedOn)
              : undefined,
            finishedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
          };
        }),
      );

      return jobStatuses.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
    } catch (error) {
      this.logger.error(
        `Failed to get jobs for document ${documentId}:`,
        error.stack,
      );
      return [];
    }
  }

  async cancelJob(jobId: string): Promise<boolean> {
    try {
      const job = await this.processingQueue.getJob(jobId);
      if (!job) {
        this.logger.warn(`Job ${jobId} not found for cancellation`);
        return false;
      }

      const state = await job.getState();
      if (state === 'completed' || state === 'failed') {
        this.logger.warn(`Job ${jobId} is already ${state}, cannot cancel`);
        return false;
      }

      await job.remove();
      this.logger.log(`Job ${jobId} cancelled successfully`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to cancel job ${jobId}:`, error.stack);
      return false;
    }
  }

  async retryJob(jobId: string): Promise<boolean> {
    try {
      const job = await this.processingQueue.getJob(jobId);
      if (!job) {
        this.logger.warn(`Job ${jobId} not found for retry`);
        return false;
      }

      await job.retry();
      this.logger.log(`Job ${jobId} retried successfully`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to retry job ${jobId}:`, error.stack);
      return false;
    }
  }

  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  }> {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.processingQueue.getWaiting(),
        this.processingQueue.getActive(),
        this.processingQueue.getCompleted(),
        this.processingQueue.getFailed(),
        this.processingQueue.getDelayed(),
      ]);

      // Check if queue is paused
      const isPaused = await this.processingQueue.isPaused();

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        paused: isPaused ? 1 : 0, // Simple paused indicator
      };
    } catch (error) {
      this.logger.error('Failed to get queue stats:', error.stack);
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: 0,
      };
    }
  }

  async cleanQueue(
    grace: number = 0,
    limit: number = 100,
    type: 'completed' | 'failed' | 'active' | 'waiting' = 'completed',
  ): Promise<number> {
    try {
      const cleaned = await this.processingQueue.clean(
        grace,
        type as any,
        limit,
      );
      this.logger.log(`Cleaned ${cleaned.length} ${type} jobs from queue`);
      return cleaned.length;
    } catch (error) {
      this.logger.error(`Failed to clean queue:`, error.stack);
      return 0;
    }
  }
}
