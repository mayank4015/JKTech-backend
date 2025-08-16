import { Controller, Get } from '@nestjs/common';
import { FileUploadService } from '../common/file-upload/file-upload.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('health/storage')
export class StorageHealthController {
  constructor(private readonly fileUploadService: FileUploadService) {}

  @Get()
  @Public()
  getStorageHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      storage: this.fileUploadService.getStorageInfo(),
    };
  }
}
