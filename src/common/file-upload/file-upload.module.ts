import { Module } from '@nestjs/common';

import { SupabaseModule } from '../supabase/supabase.module';

import { FileUploadService } from './file-upload.service';
import { LoggerModule } from '../logger/logger.module';

@Module({
  imports: [SupabaseModule, LoggerModule],
  providers: [FileUploadService],
  exports: [FileUploadService],
})
export class FileUploadModule {}
