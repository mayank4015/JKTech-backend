import { Module } from '@nestjs/common';
import { QAController } from './qa.controller';
import { QAService } from './qa.service';
import { RAGService } from './services/rag.service';
import { ConversationService } from './services/conversation.service';
import { DocumentSearchService } from './services/document-search.service';
import { PrismaModule } from '../common/prisma/prisma.module';
import { IngestionsModule } from '../ingestions/ingestions.module';

@Module({
  imports: [PrismaModule, IngestionsModule],
  controllers: [QAController],
  providers: [
    QAService,
    RAGService,
    ConversationService,
    DocumentSearchService,
  ],
  exports: [QAService],
})
export class QAModule {}
