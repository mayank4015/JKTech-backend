import { Global, Module } from '@nestjs/common';
import { SanitizerService } from './sanitizer.service';
import { SanitizePipe } from './sanitize.pipe';
import { ResponseSanitizerInterceptor } from './response-sanitizer.interceptor';

@Global()
@Module({
  providers: [SanitizerService, SanitizePipe, ResponseSanitizerInterceptor],
  exports: [SanitizerService, SanitizePipe, ResponseSanitizerInterceptor],
})
export class SanitizationModule {}
