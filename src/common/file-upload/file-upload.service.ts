import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { Multer } from 'multer';
import { Readable } from 'stream';

// Constants
const DEFAULT_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const DEFAULT_MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';
const DEFAULT_KYC_BUCKET = 'kyc-documents';

interface FileUploadResult {
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface FileStreamResult {
  stream: Readable;
  contentType: string;
  filename: string;
}

interface S3Config {
  bucketName: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
}

interface SupabaseConfig {
  url: string;
  serviceKey: string;
}

@Injectable()
export class FileUploadService {
  private readonly logger = new Logger(FileUploadService.name);
  private readonly supabase: SupabaseClient;
  private readonly bucketName: string;
  private readonly useS3Backend: boolean;
  private readonly s3Config?: S3Config;
  private readonly supabaseConfig: SupabaseConfig;

  constructor(private configService: ConfigService) {
    // Load Supabase configuration
    this.supabaseConfig = {
      url: this.configService.getOrThrow<string>('SUPABASE_URL'),
      serviceKey: this.configService.getOrThrow<string>('SUPABASE_SERVICE_KEY'),
    };

    // Check if S3 backend is configured
    const s3BucketName = this.configService.get<string>('S3_BUCKET_NAME');
    const s3Region = this.configService.get<string>('S3_REGION');
    const s3AccessKeyId = this.configService.get<string>('S3_ACCESS_KEY_ID');
    const s3SecretAccessKey = this.configService.get<string>(
      'S3_SECRET_ACCESS_KEY',
    );
    const s3Endpoint = this.configService.get<string>('S3_ENDPOINT');

    this.useS3Backend = !!(
      s3BucketName &&
      s3Region &&
      s3AccessKeyId &&
      s3SecretAccessKey
    );

    if (this.useS3Backend) {
      this.s3Config = {
        bucketName: s3BucketName!,
        region: s3Region!,
        accessKeyId: s3AccessKeyId!,
        secretAccessKey: s3SecretAccessKey!,
        endpoint: s3Endpoint || `https://s3.${s3Region}.amazonaws.com`,
      };
      this.bucketName = this.s3Config.bucketName;
      this.logger.log(
        `S3 backend configured with bucket: ${this.s3Config.bucketName}`,
      );
    } else {
      this.bucketName = DEFAULT_KYC_BUCKET;
      this.logger.log('Using Supabase native storage');
    }

    this.supabase = createClient(
      this.supabaseConfig.url,
      this.supabaseConfig.serviceKey,
    );
  }

  /**
   * Validate file type, size, and content
   */
  private validateFile(file: Multer.File, allowedTypes: string[]): void {
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Only ${allowedTypes.join(', ')} files are allowed.`,
      );
    }

    if (file.size > DEFAULT_MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File size exceeds ${DEFAULT_MAX_FILE_SIZE / (1024 * 1024)}MB limit`,
      );
    }

    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Invalid file: empty file buffer');
    }
  }

  async uploadFile(
    file: Multer.File,
    folder: string,
    allowedTypes: string[] = DEFAULT_ALLOWED_TYPES,
  ): Promise<FileUploadResult> {
    try {
      this.validateFile(file, allowedTypes);

      const fileId = randomUUID();
      const fileName = `${fileId}-${file.originalname}`;
      const filePath = `${folder}/${fileName}`;

      this.logger.debug(
        `Uploading file to ${this.useS3Backend ? 'S3' : 'Supabase'}: ${filePath}`,
      );

      // Ensure bucket exists
      await this.ensureBucketExists();

      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (error) {
        this.logger.error(`File upload failed: ${error.message}`, error.stack);
        throw new BadRequestException(`File upload failed: ${error.message}`);
      }

      // Generate the correct URL based on backend type
      const publicUrl = this.generatePublicUrl(filePath);

      this.logger.debug(`File uploaded successfully: ${publicUrl}`);

      return {
        url: publicUrl,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
      };
    } catch (error) {
      this.logger.error(`Upload error: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      if (!filePath) {
        this.logger.warn('Cannot delete file: empty file path');
        return;
      }

      this.logger.debug(
        `Deleting file from ${this.useS3Backend ? 'S3' : 'Supabase'}: ${filePath}`,
      );

      const { error } = await this.supabase.storage
        .from(this.bucketName)
        .remove([filePath]);

      if (error) {
        this.logger.error(`Error deleting file: ${error.message}`, error.stack);
        throw new BadRequestException(
          `Failed to delete file: ${error.message}`,
        );
      }

      this.logger.debug(`File deleted successfully: ${filePath}`);
    } catch (error) {
      this.logger.error(`Delete error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Generate public URL based on backend type
   */
  private generatePublicUrl(filePath: string): string {
    if (this.useS3Backend && this.s3Config) {
      // Generate S3 URL
      const baseUrl = this.s3Config.endpoint.includes('amazonaws.com')
        ? `https://${this.s3Config.bucketName}.s3.${this.s3Config.region}.amazonaws.com`
        : `${this.s3Config.endpoint}/${this.s3Config.bucketName}`;
      return `${baseUrl}/${filePath}`;
    } else {
      // Use Supabase native storage
      const {
        data: { publicUrl },
      } = this.supabase.storage.from(this.bucketName).getPublicUrl(filePath);
      return publicUrl;
    }
  }

  extractFilePathFromUrl(url: string): string {
    if (!url) {
      return '';
    }

    // Handle Supabase URLs first (handles cross-backend compatibility)
    if (this.isSupabaseUrl(url)) {
      return this.extractFilePathFromSupabaseUrl(url);
    }

    // Handle S3 URLs
    if (this.useS3Backend && this.s3Config) {
      return this.extractFilePathFromS3Url(url);
    }

    // Handle native Supabase URLs
    return this.extractFilePathFromNativeSupabaseUrl(url);
  }

  /**
   * Extract file path from Supabase URL
   */
  private extractFilePathFromSupabaseUrl(url: string): string {
    const patterns = [
      { pattern: /\/object\/sign\/([^/]+)\/(.*?)(\?|$)/, type: 'signed' },
      { pattern: /\/object\/public\/([^/]+)\/(.*?)(\?|$)/, type: 'public' },
      { pattern: /\/v1\/s3\/([^/]+)\/(.*?)(\?|$)/, type: 's3' },
    ];

    for (const { pattern } of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[2]; // Return the file path part
      }
    }

    return '';
  }

  /**
   * Extract file path from S3 URL
   */
  private extractFilePathFromS3Url(url: string): string {
    if (url.includes('.amazonaws.com/')) {
      const urlParts = url.split('.amazonaws.com/');
      return urlParts[1] || '';
    }

    // Handle custom S3 endpoints
    const bucketPath = `/${this.s3Config!.bucketName}/`;
    const urlParts = url.split(bucketPath);
    return urlParts[1] || '';
  }

  /**
   * Extract file path from native Supabase URL
   */
  private extractFilePathFromNativeSupabaseUrl(url: string): string {
    const bucketPath = `/${this.bucketName}/`;
    const urlParts = url.split(bucketPath);
    return urlParts[1] || '';
  }

  /**
   * Ensure bucket exists and create if it doesn't
   */
  private async ensureBucketExists(): Promise<void> {
    try {
      const { data: buckets, error: listError } =
        await this.supabase.storage.listBuckets();

      if (listError) {
        this.logger.warn(`Could not list buckets: ${listError.message}`);
        return;
      }

      const bucketExists = buckets?.some(
        (bucket) => bucket.name === this.bucketName,
      );

      if (!bucketExists) {
        this.logger.log(`Creating bucket: ${this.bucketName}`);
        const { error: createError } = await this.supabase.storage.createBucket(
          this.bucketName,
          {
            public: true,
            allowedMimeTypes: DEFAULT_ALLOWED_TYPES,
            fileSizeLimit: DEFAULT_MAX_FILE_SIZE,
          },
        );

        if (createError) {
          this.logger.error(`Failed to create bucket: ${createError.message}`);
        } else {
          this.logger.log(`Bucket created successfully: ${this.bucketName}`);
        }
      }
    } catch (error) {
      this.logger.error(
        `Error ensuring bucket exists: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Get file stream for document preview
   */
  async getFileStream(
    fileUrl: string,
    originalFilename: string,
  ): Promise<FileStreamResult> {
    try {
      this.logger.debug(`Processing file URL: ${fileUrl}`);

      const filePath = this.extractFilePathFromUrl(fileUrl);
      if (!filePath) {
        throw new NotFoundException(
          'File path could not be determined from URL',
        );
      }

      // Handle Supabase URLs (signed, public, or S3-compatible)
      if (this.isSupabaseUrl(fileUrl)) {
        return this.handleSupabaseFile(fileUrl, filePath, originalFilename);
      }

      // Handle S3 backend
      if (this.useS3Backend) {
        return this.handleS3File(fileUrl, originalFilename);
      }

      // Handle native Supabase storage
      return this.handleNativeSupabaseFile(filePath, originalFilename);
    } catch (error) {
      this.logger.error(
        `Error retrieving file stream: ${error.message}`,
        error.stack,
      );

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new BadRequestException('Failed to retrieve file');
    }
  }

  /**
   * Check if URL is a Supabase URL
   */
  private isSupabaseUrl(url: string): boolean {
    return (
      url.includes('supabase.co/storage/v1/object/') ||
      url.includes('supabase.co/storage/v1/s3/')
    );
  }

  /**
   * Handle Supabase file retrieval
   */
  private async handleSupabaseFile(
    fileUrl: string,
    filePath: string,
    originalFilename: string,
  ): Promise<FileStreamResult> {
    this.logger.debug('Detected Supabase URL, using Supabase API');

    const bucketName = this.extractBucketFromSupabaseUrl(fileUrl);
    this.logger.debug(`Using bucket: ${bucketName} for file path: ${filePath}`);

    // Try direct fetch for signed URLs first
    if (fileUrl.includes('/object/sign/')) {
      const directResult = await this.tryDirectFetch(fileUrl, originalFilename);
      if (directResult) {
        return directResult;
      }
    }

    // Use Supabase API for all other cases
    return this.downloadFromSupabase(bucketName, filePath, originalFilename);
  }

  /**
   * Handle S3 file retrieval
   */
  private async handleS3File(
    fileUrl: string,
    originalFilename: string,
  ): Promise<FileStreamResult> {
    this.logger.debug('Using S3 backend for file retrieval');

    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new NotFoundException('File not found in S3 storage');
    }

    return this.createFileStreamFromResponse(response, originalFilename);
  }

  /**
   * Handle native Supabase file retrieval
   */
  private async handleNativeSupabaseFile(
    filePath: string,
    originalFilename: string,
  ): Promise<FileStreamResult> {
    return this.downloadFromSupabase(
      this.bucketName,
      filePath,
      originalFilename,
    );
  }

  /**
   * Extract bucket name from Supabase URL
   */
  private extractBucketFromSupabaseUrl(url: string): string {
    if (url.includes('/object/sign/') || url.includes('/object/public/')) {
      const match = url.match(/\/object\/(?:public|sign)\/([^/]+)\//);
      return match ? match[1] : this.bucketName;
    }

    if (url.includes('/v1/s3/')) {
      const match = url.match(/\/v1\/s3\/([^/]+)\//);
      return match ? match[1] : this.bucketName;
    }

    return this.bucketName;
  }

  /**
   * Try direct fetch for signed URLs
   */
  private async tryDirectFetch(
    fileUrl: string,
    originalFilename: string,
  ): Promise<FileStreamResult | null> {
    try {
      const response = await fetch(fileUrl);
      if (response.ok) {
        return this.createFileStreamFromResponse(response, originalFilename);
      }
    } catch (error) {
      this.logger.warn(
        `Direct fetch failed, falling back to Supabase API: ${error.message}`,
      );
    }
    return null;
  }

  /**
   * Download file from Supabase storage
   */
  private async downloadFromSupabase(
    bucketName: string,
    filePath: string,
    originalFilename: string,
  ): Promise<FileStreamResult> {
    const { data, error } = await this.supabase.storage
      .from(bucketName)
      .download(filePath);

    if (error) {
      this.logger.error(`File download error: ${error.message}`);
      throw new NotFoundException('File not found in storage');
    }

    if (!data) {
      throw new NotFoundException('File data is empty');
    }

    return this.createFileStreamFromBlob(data, originalFilename);
  }

  /**
   * Create file stream from HTTP response
   */
  private async createFileStreamFromResponse(
    response: Response,
    originalFilename: string,
  ): Promise<FileStreamResult> {
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const stream = Readable.from(buffer);

    return {
      stream,
      contentType: response.headers.get('content-type') || DEFAULT_CONTENT_TYPE,
      filename: originalFilename,
    };
  }

  /**
   * Create file stream from Blob
   */
  private async createFileStreamFromBlob(
    blob: Blob,
    originalFilename: string,
  ): Promise<FileStreamResult> {
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const stream = Readable.from(buffer);

    return {
      stream,
      contentType: blob.type || DEFAULT_CONTENT_TYPE,
      filename: originalFilename,
    };
  }

  /**
   * Get storage configuration info
   */
  getStorageInfo(): {
    backend: 'S3' | 'Supabase';
    bucketName: string;
    region?: string;
  } {
    return {
      backend: this.useS3Backend ? 'S3' : 'Supabase',
      bucketName: this.bucketName,
      ...(this.s3Config && { region: this.s3Config.region }),
    };
  }
}
