import { Module } from '@nestjs/common';

import { ThrottlerBehindProxyGuard } from './throttler-behind-proxy.guard';

@Module({
  providers: [ThrottlerBehindProxyGuard],
  exports: [ThrottlerBehindProxyGuard],
})
export class RateLimitModule {}
