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
    userRole?: string,
  ): Promise<DocumentSource[]> {
    try {
      // If userId is provided, use the enhanced search from IngestionService
      if (userId) {
        const searchResults =
          await this.ingestionsService.searchProcessedContent(
            query,
            userId,
            userRole || 'viewer', // Default to viewer if role not provided
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

    // Get all processed documents for partial matching
    const documents = await this.prisma.document.findMany({
      where: {
        status: 'processed',
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
      orderBy: {
        updatedAt: 'desc',
      },
    });

    // Convert to DocumentSource format with partial matching
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

        // Calculate relevance score with partial matching
        const relevanceScore = this.calculatePartialRelevanceScore(
          doc,
          query,
          keywords,
          fullText,
        );

        // Only include documents with some relevance
        if (relevanceScore > 0) {
          const excerpt = this.extractRelevantExcerptPartial(
            fullText,
            keywords,
            200,
          );

          sources.push({
            documentId: doc.id,
            documentTitle: doc.title,
            excerpt,
            relevanceScore,
            context: doc.category || 'Document',
          });
        }
      }
    }

    // Sort by relevance score and limit results
    return sources
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
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

  /**
   * Calculate relevance score with partial matching support
   */
  private calculatePartialRelevanceScore(
    document: any,
    query: string,
    keywords: string[],
    fullText: string,
  ): number {
    let score = 0;
    const queryLower = query.toLowerCase();

    // Title partial match (highest weight)
    const titleMatch = this.calculateTextPartialMatch(document.title, keywords);
    score += titleMatch.score * 0.5;

    // Description partial match
    if (document.description) {
      const descMatch = this.calculateTextPartialMatch(
        document.description,
        keywords,
      );
      score += descMatch.score * 0.3;
    }

    // Full text partial match
    if (fullText) {
      const textMatch = this.calculateTextPartialMatch(fullText, keywords);
      score += textMatch.score * 0.4;
    }

    // Tag partial matches
    const tagMatches = document.tags.filter((tag: string) => {
      const tagLower = tag.toLowerCase();
      return keywords.some(
        (keyword) => tagLower.includes(keyword) || keyword.includes(tagLower),
      );
    });
    score += tagMatches.length * 0.1;

    // Keyword matches from processing (if available)
    const latestIngestion = document.ingestions?.[0];
    if (latestIngestion?.logs) {
      const ingestionData = latestIngestion.logs as any;
      const processedKeywords = ingestionData.processingResult?.keywords || [];
      const keywordMatches = processedKeywords.filter((keyword: string) => {
        const keywordLower = keyword.toLowerCase();
        return keywords.some(
          (queryKeyword) =>
            keywordLower.includes(queryKeyword) ||
            queryKeyword.includes(keywordLower),
        );
      });
      score += keywordMatches.length * 0.05;
    }

    // Recency bonus
    const daysSinceUpdate =
      (Date.now() - new Date(document.updatedAt).getTime()) /
      (1000 * 60 * 60 * 24);
    score += Math.max(0, 0.2 - daysSinceUpdate * 0.01);

    return Math.min(1, score);
  }

  /**
   * Calculate partial match score for text against query keywords
   */
  private calculateTextPartialMatch(
    text: string,
    queryKeywords: string[],
  ): { score: number; matchedWords: string[] } {
    if (!text || queryKeywords.length === 0) {
      return { score: 0, matchedWords: [] };
    }

    const textLower = text.toLowerCase();
    const textWords = textLower.split(/\s+/);
    const matchedWords: string[] = [];
    let totalMatches = 0;

    for (const queryWord of queryKeywords) {
      // Check for exact word matches first (higher score)
      if (textWords.some((word) => word === queryWord)) {
        totalMatches += 1.0;
        matchedWords.push(queryWord);
      }
      // Check for partial matches (substring matching)
      else if (
        textWords.some(
          (word) => word.includes(queryWord) || queryWord.includes(word),
        )
      ) {
        totalMatches += 0.7;
        matchedWords.push(queryWord);
      }
      // Check if query word is contained anywhere in the text
      else if (textLower.includes(queryWord)) {
        totalMatches += 0.5;
        matchedWords.push(queryWord);
      }
    }

    const score =
      queryKeywords.length > 0 ? totalMatches / queryKeywords.length : 0;
    return { score: Math.min(1, score), matchedWords };
  }

  /**
   * Extract relevant excerpt with partial matching support
   */
  private extractRelevantExcerptPartial(
    text: string,
    queryKeywords: string[],
    maxLength: number,
  ): string {
    if (!text) return 'No content available';

    const textLower = text.toLowerCase();
    let bestPosition = -1;
    let bestScore = 0;

    // Find the best position that contains the most query keywords
    for (let i = 0; i < text.length - maxLength; i += 50) {
      const segment = textLower.substring(i, i + maxLength);
      let segmentScore = 0;

      for (const keyword of queryKeywords) {
        if (segment.includes(keyword)) {
          segmentScore += 1;
        }
      }

      if (segmentScore > bestScore) {
        bestScore = segmentScore;
        bestPosition = i;
      }
    }

    // If no good position found, try to find any keyword match
    if (bestPosition === -1) {
      for (const keyword of queryKeywords) {
        const keywordIndex = textLower.indexOf(keyword);
        if (keywordIndex !== -1) {
          bestPosition = Math.max(0, keywordIndex - maxLength / 2);
          break;
        }
      }
    }

    // Fallback to beginning if no matches found
    if (bestPosition === -1) {
      bestPosition = 0;
    }

    const start = bestPosition;
    const end = Math.min(text.length, start + maxLength);
    let excerpt = text.substring(start, end);

    if (start > 0) excerpt = '...' + excerpt;
    if (end < text.length) excerpt = excerpt + '...';

    return excerpt;
  }
}
