import { Module } from '@nestjs/common';
import { QAController } from './qa.controller';
import { QAService } from './qa.service';
import { RAGService } from './services/rag.service';
import { ConversationService } from './services/conversation.service';
import { DocumentSearchService } from './services/document-search.service';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
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
