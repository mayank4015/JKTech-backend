import { Module } from '@nestjs/common';

import { PrismaModule } from '../common/prisma/prisma.module';
import { SupabaseModule } from '../common/supabase/supabase.module';

import { HealthController } from './health.controller';
import { StorageHealthController } from './storage-health.controller';
import { FileUploadModule } from 'src/common/file-upload/file-upload.module';

@Module({
  imports: [PrismaModule, SupabaseModule, FileUploadModule],
  controllers: [HealthController, StorageHealthController],
})
export class HealthModule {}
