# JKTech System Design Documentation

## System Overview

JKTech is a document management platform with basic Q&A capabilities. The system consists of three main services: a Next.js frontend, a NestJS backend API, and a processing service for document handling.

### Core Features

- Document upload and management with metadata
- User authentication with role-based access (admin, editor, viewer)
- Queue-based document processing simulation
- Keyword-based document search and Q&A
- Conversation management for organizing questions and answers

### Implementation Status

**Production Ready:**

- Document management with Supabase Storage
- User authentication and authorization
- PostgreSQL database with Prisma ORM
- Redis-based job queues
- Frontend UI with Next.js 15

**Mock/Simulated:**

- Document text extraction (template responses)
- OCR processing (mock results)
- Keyword extraction (basic text splitting)
- Document summarization (template-based)
- Search indexing (logging only)

**Basic Implementation:**

- Q&A system uses keyword matching, not AI/RAG
- Document search through partial text matching
- Response generation from document excerpts

## Architecture

### Service Structure

The platform uses a microservices approach:

1. **Frontend** (Next.js 15): User interface with React 19 and Tailwind CSS
2. **Backend API** (NestJS): Business logic, authentication, and data management
3. **Processing Service** (NestJS): Document processing simulation

### Data Storage

- **PostgreSQL**: Primary database for users, documents, conversations
- **Redis**: Job queues and caching
- **Supabase Storage**: File storage and management

### Communication

- Frontend communicates with backend via REST API
- Backend sends processing jobs to processing service via Redis queues
- Processing service sends results back via webhooks

## Database Design

### Core Entities

**Users**: Authentication and role management

- Roles: admin (full access), editor (document management), viewer (read-only)

**Documents**: File metadata and processing status

- Supports various file types with metadata tracking
- Status tracking: uploaded, pending, processed, failed

**Ingestions**: Processing job tracking

- Progress monitoring and error handling
- Configuration storage for processing options

**Q&A System**: Conversation and question management

- Conversations group related questions
- Questions linked to answers with confidence scores
- Source tracking for document references

## API Design

### Authentication

JWT tokens with HTTP-only cookies, role-based endpoint access

### Core Endpoints

- `/auth/*` - Authentication and user management
- `/documents/*` - Document upload and management
- `/ingestions/*` - Processing job management
- `/qa/*` - Question answering and conversations
- `/health/*` - System health monitoring

### Response Format

Consistent JSON responses with success/error status, data payload, and metadata

## Processing Service

### Mock Processing Pipeline

The processing service simulates document analysis:

1. **Text Extraction**: Returns template text based on file type
2. **OCR Processing**: Mock OCR results for image files
3. **Keyword Extraction**: Basic word splitting and filtering
4. **Summarization**: Template-based summary generation
5. **Language Detection**: Simple pattern matching for English

Processing includes artificial delays to simulate real processing time and progress tracking.

## Q&A System

### Search Implementation

The Q&A system uses keyword-based search rather than AI:

- Query processing splits questions into keywords
- Document matching uses partial text matching
- Relevance scoring based on keyword frequency and position
- Response generation combines excerpts from top matching documents

### Limitations

- No semantic understanding or AI models
- Simple text matching without context awareness
- Template-based responses rather than generated content
- No learning from user interactions

## Security

### Authentication & Authorization

- JWT tokens with refresh mechanism
- Role-based access control throughout the system
- HTTP-only cookies for secure token storage

### Data Protection

- Input validation with Zod schemas
- SQL injection prevention through Prisma ORM
- File upload restrictions and validation
- HTTPS enforcement for all communications

## Technology Stack

### Frontend

- Next.js 15 with React 19
- TypeScript for type safety
- Tailwind CSS for styling
- Radix UI for accessible components

### Backend

- NestJS with TypeScript
- Prisma ORM with PostgreSQL
- Redis for queues and caching
- Winston for logging
- Bull for job processing

### Infrastructure

- Supabase for file storage
- Docker for containerization
- Environment-based configuration

## Deployment

### Containerization

Each service runs in Docker containers with multi-stage builds for optimization.

### Environment Management

- Development, staging, and production environments
- Environment variables for configuration
- Health checks for service monitoring

## Development Workflow

### Code Organization

- Monorepo structure with separate service directories
- Shared types and utilities where appropriate
- Consistent coding standards across services

### Quality Assurance

- TypeScript strict mode for type safety
- ESLint and Prettier for code consistency
- Unit and integration testing
- Code review process

## Future Enhancements

To implement true AI capabilities, the system would need:

- Integration with language models (OpenAI, Anthropic, or local models)
- Vector embeddings for semantic search
- Proper document chunking and indexing
- Context-aware response generation

The current architecture provides a solid foundation for these enhancements while maintaining the existing functionality.
