/**
 * Utility functions for transforming document data between backend and frontend formats
 */

import { Document } from '@prisma/client';

export interface DocumentWithUploader extends Omit<Document, 'fileSize'> {
  fileSize: string;
  uploader: {
    id: string;
    name: string;
    email: string;
  };
}

export interface FrontendDocument {
  id: string;
  title: string;
  description?: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedByName: string;
  createdAt: string;
  updatedAt: string;
  status: 'pending' | 'processing' | 'processed' | 'failed';
  tags: string[];
  category?: string;
  processingProgress?: number;
  errorMessage?: string;
}

/**
 * Transform backend document to frontend format
 */
export function transformDocumentForFrontend(
  document: DocumentWithUploader,
): FrontendDocument {
  return {
    id: document.id,
    title: document.title,
    description: document.description || undefined,
    fileName: document.fileName,
    fileUrl: document.fileUrl,
    fileType: document.fileType,
    fileSize: parseInt(document.fileSize, 10), // Convert string back to number
    uploadedBy: document.uploadedBy,
    uploadedByName: document.uploader.name,
    createdAt:
      document.createdAt instanceof Date
        ? document.createdAt.toISOString()
        : document.createdAt,
    updatedAt:
      document.updatedAt instanceof Date
        ? document.updatedAt.toISOString()
        : document.updatedAt,
    status: document.status as
      | 'pending'
      | 'processing'
      | 'processed'
      | 'failed',
    tags: document.tags,
    category: document.category || undefined,
    processingProgress: 0, // Default value, can be updated based on ingestion status
    errorMessage: undefined, // Can be populated from ingestion errors
  };
}

/**
 * Transform array of backend documents to frontend format
 */
export function transformDocumentsForFrontend(
  documents: DocumentWithUploader[],
): FrontendDocument[] {
  return documents.map(transformDocumentForFrontend);
}
