export interface DocumentSource {
  documentId: string;
  documentTitle: string;
  excerpt: string;
  relevanceScore: number;
  pageNumber?: number;
  chunkId?: string;
  startPosition?: number;
  endPosition?: number;
  context?: string;
}

export interface RAGResult {
  answer: string;
  confidence: number;
  sources: DocumentSource[];
}

export interface QAFilters {
  search?: string;
  isBookmarked?: boolean;
  dateRange?: {
    start: string;
    end: string;
  };
  tags?: string[];
}
