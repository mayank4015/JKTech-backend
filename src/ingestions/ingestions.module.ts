import { Module } from '@nestjs/common';
import { IngestionsController } from './ingestions.controller';
import { IngestionsService } from './ingestions.service';
import { PrismaModule } from '../common/prisma/prisma.module';
import { LoggerModule } from '../common/logger/logger.module';

@Module({
  imports: [PrismaModule, LoggerModule],
  controllers: [IngestionsController],
  providers: [IngestionsService],
  exports: [IngestionsService],
})
export class IngestionsModule {}
