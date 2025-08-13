import { Injectable, Logger } from '@nestjs/common';
import { DocumentSearchService } from './document-search.service';
import { RAGResult, DocumentSource } from '../types/qa.types';

@Injectable()
export class RAGService {
  private readonly logger = new Logger(RAGService.name);

  constructor(private readonly documentSearchService: DocumentSearchService) {}

  async generateAnswer(question: string): Promise<RAGResult> {
    try {
      this.logger.log(`Generating answer for question: ${question}`);

      // Step 1: Retrieve relevant documents
      const sources = await this.documentSearchService.searchDocuments(
        question,
        5,
      );

      if (sources.length === 0) {
        return {
          answer:
            "I couldn't find any relevant documents to answer your question. Please try rephrasing your question or ensure that relevant documents have been uploaded and processed.",
          confidence: 0.1,
          sources: [],
        };
      }

      // Step 2: Generate answer based on retrieved sources
      const answer = this.constructAnswer(question, sources);
      const confidence = this.calculateConfidence(sources);

      this.logger.log(`Generated answer with confidence: ${confidence}`);

      return {
        answer,
        confidence,
        sources,
      };
    } catch (error) {
      this.logger.error('Error generating answer:', error);
      return {
        answer:
          'I encountered an error while processing your question. Please try again.',
        confidence: 0.0,
        sources: [],
      };
    }
  }

  private constructAnswer(question: string, sources: DocumentSource[]): string {
    if (sources.length === 0) {
      return "I couldn't find relevant information to answer your question.";
    }

    // Create a comprehensive answer using the sources
    let answer = "Based on the available documents, here's what I found:\n\n";

    // Use the most relevant sources (top 3)
    const topSources = sources.slice(0, 3);

    topSources.forEach((source, index) => {
      answer += `${index + 1}. From "${source.documentTitle}":\n`;
      answer += `${source.excerpt}\n\n`;
    });

    // Add a summary if multiple sources
    if (topSources.length > 1) {
      answer += 'Summary: ';
      answer += this.generateSummary(question, topSources);
    }

    return answer.trim();
  }

  private generateSummary(question: string, sources: DocumentSource[]): string {
    // Simple extractive summary based on question keywords
    const questionKeywords = question
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 2);

    // Find the most relevant excerpts
    const relevantPhrases: string[] = [];

    sources.forEach((source) => {
      const sentences = source.excerpt
        .split(/[.!?]+/)
        .filter((s) => s.trim().length > 10);

      sentences.forEach((sentence) => {
        const lowerSentence = sentence.toLowerCase();
        const keywordMatches = questionKeywords.filter((keyword) =>
          lowerSentence.includes(keyword),
        ).length;

        if (keywordMatches > 0) {
          relevantPhrases.push(sentence.trim());
        }
      });
    });

    if (relevantPhrases.length === 0) {
      return 'The information from multiple documents suggests a comprehensive answer to your question.';
    }

    // Return the most relevant phrase or combine them
    return relevantPhrases.slice(0, 2).join('. ') + '.';
  }

  private calculateConfidence(sources: DocumentSource[]): number {
    if (sources.length === 0) return 0.0;

    // Base confidence on source quality and quantity
    const avgRelevanceScore =
      sources.reduce((sum, source) => sum + source.relevanceScore, 0) /
      sources.length;
    const sourceCountBonus = Math.min(sources.length * 0.1, 0.3);

    return Math.min(0.95, avgRelevanceScore + sourceCountBonus);
  }
}
