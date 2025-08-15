import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IngestionsService } from '../../ingestions/ingestions.service';
import { DocumentSource } from '../types/qa.types';

@Injectable()
export class DocumentSearchService {
  private readonly logger = new Logger(DocumentSearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestionsService: IngestionsService,
  ) {}

  async searchDocuments(
    query: string,
    limit: number = 5,
    userId?: string,
  ): Promise<DocumentSource[]> {
    try {
      // If userId is provided, use the enhanced search from IngestionService
      if (userId) {
        const searchResults =
          await this.ingestionsService.searchProcessedContent(
            query,
            userId,
            limit,
          );

        // Convert to DocumentSource format
        const sources: DocumentSource[] = [];

        for (const result of searchResults) {
          // Get document details
          const document = await this.prisma.document.findUnique({
            where: { id: result.documentId },
            select: {
              id: true,
              title: true,
              category: true,
            },
          });

          if (document) {
            sources.push({
              documentId: result.documentId,
              documentTitle: document.title,
              excerpt: result.excerpt,
              relevanceScore: result.relevanceScore,
              context: `${document.category || 'Document'} (${result.matchType})`,
            });
          }
        }

        return sources;
      }

      // Fallback to basic search for backward compatibility
      return this.basicDocumentSearch(query, limit);
    } catch (error) {
      this.logger.error('Error searching documents:', error);
      return [];
    }
  }

  private async basicDocumentSearch(
    query: string,
    limit: number,
  ): Promise<DocumentSource[]> {
    // Extract keywords from query
    const keywords = this.extractKeywords(query);

    // Search in processed documents
    const documents = await this.prisma.document.findMany({
      where: {
        status: 'processed',
        OR: [
          {
            title: {
              contains: query,
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: query,
              mode: 'insensitive',
            },
          },
          {
            tags: {
              hasSome: keywords,
            },
          },
        ],
      },
      include: {
        ingestions: {
          where: {
            status: 'completed',
          },
          orderBy: {
            completedAt: 'desc',
          },
          take: 1,
        },
      },
      take: limit,
      orderBy: {
        updatedAt: 'desc',
      },
    });

    // Convert to DocumentSource format
    const sources: DocumentSource[] = [];

    for (const doc of documents) {
      const latestIngestion = doc.ingestions[0];
      if (latestIngestion?.logs) {
        const ingestionData = latestIngestion.logs as any;

        // Extract relevant text excerpt from processed content
        const fullText =
          ingestionData.processingResult?.extractedText ||
          ingestionData.extractedText ||
          doc.description ||
          '';

        const excerpt = this.extractRelevantExcerpt(fullText, query, 200);

        sources.push({
          documentId: doc.id,
          documentTitle: doc.title,
          excerpt,
          relevanceScore: this.calculateRelevanceScore(doc, query, keywords),
          context: doc.category || 'Document',
        });
      }
    }

    // Sort by relevance score
    return sources.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  private extractKeywords(query: string): string[] {
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 2)
      .slice(0, 10);
  }

  private extractRelevantExcerpt(
    text: string,
    query: string,
    maxLength: number,
  ): string {
    if (!text) return 'No content available';

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();

    // Find the position of the query in the text
    const queryIndex = lowerText.indexOf(lowerQuery);

    if (queryIndex === -1) {
      // If exact query not found, return beginning of text
      return (
        text.substring(0, maxLength) + (text.length > maxLength ? '...' : '')
      );
    }

    // Extract text around the query
    const start = Math.max(0, queryIndex - maxLength / 2);
    const end = Math.min(text.length, start + maxLength);

    let excerpt = text.substring(start, end);

    if (start > 0) excerpt = '...' + excerpt;
    if (end < text.length) excerpt = excerpt + '...';

    return excerpt;
  }

  private calculateRelevanceScore(
    document: any,
    query: string,
    keywords: string[],
  ): number {
    let score = 0;
    const lowerQuery = query.toLowerCase();

    // Title match (highest weight)
    if (document.title.toLowerCase().includes(lowerQuery)) {
      score += 0.5;
    }

    // Description match
    if (document.description?.toLowerCase().includes(lowerQuery)) {
      score += 0.3;
    }

    // Tag matches
    const matchingTags = document.tags.filter((tag: string) =>
      keywords.includes(tag.toLowerCase()),
    );
    score += matchingTags.length * 0.1;

    // Keyword matches from processing (if available)
    const latestIngestion = document.ingestions?.[0];
    if (latestIngestion?.logs) {
      const ingestionData = latestIngestion.logs as any;
      const processedKeywords = ingestionData.processingResult?.keywords || [];
      const keywordMatches = processedKeywords.filter((keyword: string) =>
        keywords.includes(keyword.toLowerCase()),
      );
      score += keywordMatches.length * 0.05;
    }

    // Recency bonus
    const daysSinceUpdate =
      (Date.now() - new Date(document.updatedAt).getTime()) /
      (1000 * 60 * 60 * 24);
    score += Math.max(0, 0.2 - daysSinceUpdate * 0.01);

    return Math.min(1, score);
  }
}
