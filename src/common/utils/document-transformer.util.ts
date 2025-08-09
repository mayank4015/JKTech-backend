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
  // Safely parse fileSize, defaulting to 0 if invalid
  const fileSize = document.fileSize ? parseInt(document.fileSize, 10) : 0;
  const safeParsedFileSize = isNaN(fileSize) ? 0 : fileSize;

  // Transform dates to ISO strings - check for toISOString method instead of instanceof
  const createdAtString =
    document.createdAt &&
    typeof document.createdAt === 'object' &&
    typeof document.createdAt.toISOString === 'function'
      ? isNaN(document.createdAt.getTime())
        ? String(document.createdAt)
        : document.createdAt.toISOString()
      : String(document.createdAt);

  const updatedAtString =
    document.updatedAt &&
    typeof document.updatedAt === 'object' &&
    typeof document.updatedAt.toISOString === 'function'
      ? isNaN(document.updatedAt.getTime())
        ? String(document.updatedAt)
        : document.updatedAt.toISOString()
      : String(document.updatedAt);

  const result: FrontendDocument = {
    id: document.id,
    title: document.title,
    description: document.description || undefined,
    fileName: document.fileName,
    fileUrl: document.fileUrl,
    fileType: document.fileType,
    fileSize: safeParsedFileSize,
    uploadedBy: document.uploadedBy,
    uploadedByName: document.uploader?.name || 'Unknown',
    createdAt: createdAtString,
    updatedAt: updatedAtString,
    status: document.status as
      | 'pending'
      | 'processing'
      | 'processed'
      | 'failed',
    tags: document.tags || [],
    category: document.category || undefined,
    processingProgress: 0, // Default value, can be updated based on ingestion status
    errorMessage: undefined, // Can be populated from ingestion errors
  };

  return result;
}

/**
 * Transform array of backend documents to frontend format
 */
export function transformDocumentsForFrontend(
  documents: DocumentWithUploader[],
): FrontendDocument[] {
  if (!documents || !Array.isArray(documents)) {
    return [];
  }

  return documents
    .filter((doc) => doc !== null && doc !== undefined)
    .map(transformDocumentForFrontend);
}
