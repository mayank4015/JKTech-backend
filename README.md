# JKTech Backend API

A production-ready NestJS backend application with TypeScript, Prisma ORM, PostgreSQL, comprehensive logging, authentication, and enterprise-grade architecture patterns.

## Features

- **Framework**: NestJS 11.x with TypeScript 5.7.x
- **Database**: PostgreSQL with Prisma ORM 6.x
- **Authentication**: JWT with Passport and cookie-based sessions
- **Logging**: Winston with structured logging and daily rotation
- **Validation**: class-validator and class-transformer
- **Rate Limiting**: @nestjs/throttler with proxy support
- **File Upload**: Supabase Storage integration
- **Testing**: Jest with e2e testing setup
- **Code Quality**: ESLint + Prettier
- **Security**: CORS, helmet, rate limiting, input validation

## Project Structure

```
src/
├── app.controller.ts
├── app.module.ts
├── app.service.ts
├── main.ts
├── auth/                    # Authentication module
├── common/                  # Shared utilities and services
│   ├── access-control/      # Role-based access control
│   ├── file-upload/         # File upload service
│   ├── filters/             # Global exception filters
│   ├── interceptors/        # Global interceptors
│   ├── logger/              # Winston logger service
│   ├── middleware/          # Custom middleware
│   ├── pipes/               # Validation pipes
│   ├── prisma/              # Database service
│   ├── providers/           # Async storage provider
│   ├── rate-limit/          # Rate limiting
│   ├── supabase/            # Supabase integration
│   └── utils/               # Utility functions
├── config/                  # Configuration service
└── health/                  # Health check endpoints
```

## Getting Started

### Prerequisites

- Node.js 20.x or higher
- PostgreSQL 14.x or higher
- npm or yarn

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

- `GET /` - API status
- `GET /health` - Health check
- `GET /health/database` - Database health check
- `GET /health/storage` - Storage health check
- `POST /auth/login` - User login
- `POST /auth/register` - User registration

### Protected Endpoints

- `POST /auth/logout` - User logout
- `POST /auth/profile` - Get user profile

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