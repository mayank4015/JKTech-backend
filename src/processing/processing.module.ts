import { Module } from '@nestjs/common';
import { ProcessingController } from './processing.controller';
import { IngestionsModule } from '../ingestions/ingestions.module';
import { QueuesModule } from '../common/queues/queues.module';
import { AppConfigModule } from '../config/app-config.module';
import { LoggerModule } from '../common/logger/logger.module';

@Module({
  imports: [IngestionsModule, QueuesModule, AppConfigModule, LoggerModule],
  controllers: [ProcessingController],
})
export class ProcessingModule {}
