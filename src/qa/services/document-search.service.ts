import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DocumentSource } from '../types/qa.types';

@Injectable()
export class DocumentSearchService {
  private readonly logger = new Logger(DocumentSearchService.name);

  constructor(private readonly prisma: PrismaService) {}

  async searchDocuments(
    query: string,
    limit: number = 5,
  ): Promise<DocumentSource[]> {
    try {
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

          // Extract relevant text excerpt
          const excerpt = this.extractRelevantExcerpt(
            ingestionData.extractedText || doc.description || '',
            query,
            200,
          );

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
    } catch (error) {
      this.logger.error('Error searching documents:', error);
      return [];
    }
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

    // Recency bonus
    const daysSinceUpdate =
      (Date.now() - new Date(document.updatedAt).getTime()) /
      (1000 * 60 * 60 * 24);
    score += Math.max(0, 0.2 - daysSinceUpdate * 0.01);

    return Math.min(1, score);
  }
}
