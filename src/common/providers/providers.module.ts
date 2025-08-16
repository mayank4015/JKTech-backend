import { Module } from '@nestjs/common';

import { AsyncStorageProvider } from './async-storage.provider';

@Module({
  providers: [AsyncStorageProvider],
  exports: [AsyncStorageProvider],
})
export class ProvidersModule {}
