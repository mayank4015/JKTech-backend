# JKTech Backend API

A production-ready NestJS backend application for the JKTech document processing and Q&A system. Built with TypeScript, Prisma ORM, PostgreSQL, comprehensive logging, authentication, and enterprise-grade architecture patterns.

## Features

- **Framework**: NestJS 11.x with TypeScript 5.7.x
- **Database**: PostgreSQL with Prisma ORM 6.x
- **Authentication**: JWT with Passport and cookie-based sessions
- **Logging**: Winston with structured logging and daily rotation
- **Validation**: class-validator and class-transformer with Zod
- **Rate Limiting**: @nestjs/throttler with proxy support
- **File Upload**: Supabase Storage integration
- **Queue Management**: Bull Queue with Redis for background processing
- **Testing**: Jest with e2e testing setup and 80% coverage threshold
- **Code Quality**: ESLint + Prettier with strict TypeScript configuration
- **Security**: CORS, helmet, rate limiting, input validation, and sanitization
- **Microservices**: Integration with processing service for document handling
- **Health Checks**: Comprehensive health monitoring for database and external services

## Project Structure

```
src/
├── app.controller.ts        # Main application controller
├── app.module.ts           # Root application module
├── app.service.ts          # Main application service
├── main.ts                 # Application entry point
├── auth/                   # Authentication & authorization
├── common/                 # Shared utilities and services
│   ├── access-control/     # Role-based access control (RBAC)
│   ├── file-upload/        # File upload service with Supabase
│   ├── filters/            # Global exception filters
│   ├── interceptors/       # Global interceptors (logging, transform)
│   ├── logger/             # Winston logger service
│   ├── middleware/         # Custom middleware (request ID, context)
│   ├── pipes/              # Validation pipes
│   ├── prisma/             # Database service and client
│   ├── providers/          # Async storage provider
│   ├── rate-limit/         # Rate limiting configuration
│   ├── supabase/           # Supabase integration
│   └── utils/              # Utility functions
├── config/                 # Configuration service
├── documents/              # Document management module
├── health/                 # Health check endpoints
├── ingestions/             # Document ingestion processing
├── performance/            # Performance monitoring
├── processing/             # Processing service integration
├── qa/                     # Question & Answer module
├── sanitization/           # Input sanitization
└── users/                  # User management module
```

## Getting Started

### Prerequisites

- **Node.js**: 20.x or higher
- **PostgreSQL**: 14.x or higher
- **Redis**: 6.x or higher (for Bull Queue)
- **Package Manager**: npm or yarn
- **Supabase Account**: For file storage (optional but recommended)

### Installation

1. Clone the repository and navigate to the backend directory:

   ```bash
   cd JKTech-backend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up environment variables:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your configuration:
   - Database connection string
   - JWT secret
   - Supabase credentials (optional)
   - Other service configurations

4. Set up the database:

   ```bash
   # Generate Prisma client
   npm run prisma:generate

   # Run database migrations
   npm run prisma:migrate

   # Seed the database (optional)
   npm run prisma:seed
   ```

### Development

Start the development server:

```bash
npm run start:dev
```

The API will be available at `http://localhost:8080`

### Available Scripts

- `npm run build` - Build the application
- `npm run start` - Start the production server
- `npm run start:dev` - Start development server with hot reload
- `npm run start:debug` - Start development server with debugging
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run format` - Format code with Prettier
- `npm run test` - Run unit tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:cov` - Run tests with coverage
- `npm run test:e2e` - Run end-to-end tests

### Database Scripts

- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:deploy` - Deploy migrations to production
- `npm run prisma:reset` - Reset database and run migrations
- `npm run prisma:studio` - Open Prisma Studio
- `npm run prisma:seed` - Seed the database
- `npm run db:push` - Push schema changes to database

## API Endpoints

### Public Endpoints

- `GET /` - API status and information
- `GET /health` - Overall health check
- `GET /health/database` - Database connectivity check
- `GET /health/storage` - Supabase storage health check
- `POST /auth/login` - User authentication
- `POST /auth/register` - User registration

### Protected Endpoints

#### Authentication

- `POST /auth/logout` - User logout
- `GET /auth/profile` - Get current user profile
- `PUT /auth/profile` - Update user profile

#### Documents

- `GET /documents` - List user documents
- `POST /documents` - Upload new document
- `GET /documents/:id` - Get document details
- `PUT /documents/:id` - Update document metadata
- `DELETE /documents/:id` - Delete document

#### Ingestions

- `GET /ingestions` - List processing jobs
- `POST /ingestions` - Start document processing
- `GET /ingestions/:id` - Get processing status
- `DELETE /ingestions/:id` - Cancel processing job

#### Q&A System

- `GET /conversations` - List user conversations
- `POST /conversations` - Create new conversation
- `GET /conversations/:id` - Get conversation details
- `POST /conversations/:id/questions` - Ask question
- `GET /qa/saved` - Get saved Q&As
- `POST /qa/save` - Save Q&A pair

#### Users (Admin only)

- `GET /users` - List all users
- `PUT /users/:id/role` - Update user role
- `PUT /users/:id/status` - Activate/deactivate user

## Authentication

The API uses JWT tokens for authentication with the following features:

- HTTP-only cookies for token storage
- Role-based access control (Admin, Moderator, User)
- Public route decorator for unprotected endpoints
- Automatic token validation on protected routes

### Default Users (after seeding)

- **Admin**: admin@jktech.com / admin123
- **Moderator**: moderator@jktech.com / moderator123
- **User**: user@jktech.com / user123

## Configuration

The application uses environment variables for configuration. See `.env.example` for all available options:

- **Server**: Port, CORS settings
- **Database**: PostgreSQL connection
- **JWT**: Secret keys and expiration
- **Supabase**: Storage configuration
- **Rate Limiting**: Throttle settings

## Logging

The application uses Winston for structured logging with:

- Console output in development
- File rotation in production
- Request/response logging
- Error tracking with context
- Trace logging for debugging

Log files (production):

- `logs/application-YYYY-MM-DD.log` - Application logs
- `logs/error-YYYY-MM-DD.log` - Error logs
- `logs/trace-YYYY-MM-DD.log` - Trace logs

## Testing

Run the test suite:

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## Deployment

### Docker

Build and run with Docker:

```bash
# Build image
docker build -t jktech-backend .

# Run container
docker run -p 8080:8080 --env-file .env jktech-backend
```

### Production

1. Build the application:

   ```bash
   npm run build
   ```

2. Set production environment variables

3. Run database migrations:

   ```bash
   npm run prisma:deploy
   ```

4. Start the production server:
   ```bash
   npm run start:prod
   ```

## Architecture

The application follows clean architecture principles:

- **Modular Design**: Feature-based modules
- **Dependency Injection**: NestJS IoC container
- **Separation of Concerns**: Controllers, services, and repositories
- **Global Middleware**: Request ID, async context, logging
- **Error Handling**: Global exception filters
- **Validation**: Input validation with class-validator
- **Security**: Rate limiting, CORS, input sanitization

## Contributing

1. Follow the existing code style
2. Write tests for new features
3. Update documentation as needed
4. Use conventional commit messages

## License

This project is licensed under the UNLICENSED License.
