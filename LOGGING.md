# ISP-SaaS Backend Logging Implementation

## Overview

The ISP-SaaS backend implements a comprehensive logging system using Winston with NestJS integration. The system creates structured logs with two distinct types: **Application logs** (summary) and **Trace logs** (detailed), both linked by unique request IDs.

## Architecture

### Core Components

1. **LoggerModule** (`src/common/logger/logger.module.ts`)
2. **LoggerService** (`src/common/logger/logger.service.ts`)
3. **LoggingInterceptor** (`src/common/interceptors/logging.interceptor.ts`)
4. **HttpExceptionFilter** (`src/common/filters/http-exception.filter.ts`)
5. **RequestIdMiddleware** (`src/common/middleware/request-id.middleware.ts`)
6. **Safe JSON Utilities** (`src/common/utils/safe-json.util.ts`)

## Log Structure and Organization

### Directory Structure

```
logs/
├── application.log          # Single application log file
└── trace/                   # Trace logs directory
    ├── ISP-SAAS-2025-01-01.log
    ├── ISP-SAAS-2025-01-02.log
    └── ...                  # Daily rotated files
```

### Log Types

#### 1. Application Logs (`logs/application.log`)

- **Purpose**: One-line summaries of requests/responses
- **Level**: `info` and above
- **Format**: JSON with timestamp, context, message, and request ID
- **Content**: High-level request summaries, application events, errors

**Example Application Log Entry:**

```json
{
  "context": "Application",
  "level": "info",
  "message": "GET /customers 200 45ms",
  "timestamp": "2025-01-15 10:30:45",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "userAgent": "Mozilla/5.0...",
  "ip": "192.168.1.100"
}
```

#### 2. Trace Logs (`logs/trace/ISP-SAAS-YYYY-MM-DD.log`)

- **Purpose**: Detailed request/response information for debugging
- **Level**: `debug` and above
- **Format**: JSON with comprehensive metadata
- **Rotation**: Daily rotation with 14-day retention, 20MB max file size
- **Content**: Full request/response bodies, headers, detailed error traces

**Example Trace Log Entries:**

```json
{
  "context": "Trace",
  "level": "debug",
  "message": "Request received: GET /customers",
  "timestamp": "2025-01-15 10:30:45",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "headers": {
    "authorization": "Bearer [REDACTED]",
    "content-type": "application/json"
  },
  "body": {...}
}

{
  "context": "Trace",
  "level": "debug",
  "message": "Response sent: 200 in 45ms",
  "timestamp": "2025-01-15 10:30:45",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "body": {...}
}
```

## Implementation Steps

### Step 1: Directory Creation

The logging system automatically creates the required directory structure:

```typescript
// In LoggerModule.forRootAsync()
const logDir = path.join(process.cwd(), 'logs');
const traceDir = path.join(logDir, 'trace');

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

if (!fs.existsSync(traceDir)) {
  fs.mkdirSync(traceDir, { recursive: true });
}
```

### Step 2: Winston Transport Configuration

#### Application Log Transport

```typescript
const applicationLogTransport = new winston.transports.File({
  filename: path.join(logDir, 'application.log'),
  level: 'info',
  format: logFormat,
});
```

#### Trace Log Transport (Daily Rotation)

```typescript
const traceLogTransport = new winston.transports.DailyRotateFile({
  dirname: traceDir,
  filename: 'ISP-SAAS-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  level: 'debug',
  format: logFormat,
  maxSize: '20m',
  maxFiles: '14d',
});
```

### Step 3: Request ID Generation

Each request gets a unique identifier for tracing:

```typescript
// RequestIdMiddleware
const requestId = req.headers['x-request-id'] || uuidv4();
req['requestId'] = requestId;
res.setHeader('X-Request-ID', requestId);
```

### Step 4: Request/Response Logging Flow

#### Request Interception

```typescript
// LoggingInterceptor.intercept()
this.logger.logRequestTrace(
  requestId,
  method,
  url,
  headers,
  prepareForLogging(body),
);
```

#### Response Logging

```typescript
// On successful response
this.logger.logResponseTrace(
  requestId,
  statusCode,
  prepareForLogging(data),
  responseTime,
);
this.logger.logRequest(
  requestId,
  method,
  url,
  statusCode,
  responseTime,
  userAgent,
  ip,
);

// On error
this.logger.logErrorTrace(requestId, error);
this.logger.logRequest(
  requestId,
  method,
  url,
  error.status || 500,
  responseTime,
  userAgent,
  ip,
);
```

### Step 5: Safe JSON Serialization

The system handles circular references and sensitive data:

```typescript
// Safe JSON utilities prevent circular reference errors
export function prepareForLogging(obj: unknown): unknown {
  // Handles circular references, Error objects, and complex objects
  return JSON.parse(safeStringify(obj));
}

export function sanitizeError(error: Error): SerializableError {
  return {
    message: error.message,
    name: error.name,
    stack: error.stack,
  };
}
```

## Key Features

### 1. Request Correlation

- Every request gets a unique UUID
- Same request ID appears in both application and trace logs
- Request ID included in response headers for client-side correlation

### 2. Automatic Log Rotation

- Trace logs rotate daily
- 14-day retention policy
- 20MB maximum file size before rotation
- Automatic cleanup of old files

### 3. Safe Data Handling

- Circular reference protection
- Error object serialization
- Sensitive data can be redacted
- Handles complex objects safely

### 4. Multiple Log Levels

- **Application logs**: `info` level and above (summaries)
- **Trace logs**: `debug` level and above (detailed)
- **Console**: Development-friendly colored output

### 5. Global Exception Handling

- All unhandled exceptions are logged
- Stack traces preserved in trace logs
- Consistent error response format

## Log Linking Strategy

### How Application and Trace Logs Connect

1. **Request ID as Primary Key**: Each request generates a unique UUID that appears in all related log entries
2. **Application Log Entry**: Contains one summary line per request with the request ID
3. **Trace Log Entries**: Contains multiple detailed entries (request, response, errors) all sharing the same request ID
4. **Cross-Reference**: Use request ID to find all related trace entries for any application log entry

### Example Correlation

**Application Log:**

```json
{
  "context": "Application",
  "level": "info",
  "message": "POST /auth/login 200 156ms",
  "timestamp": "2025-01-15 10:30:45",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Related Trace Logs:**

```json
{"context":"Trace","level":"debug","message":"Request received: POST /auth/login","timestamp":"2025-01-15 10:30:45","requestId":"550e8400-e29b-41d4-a716-446655440000","headers":{...},"body":{...}}
{"context":"Trace","level":"debug","message":"Response sent: 200 in 156ms","timestamp":"2025-01-15 10:30:45","requestId":"550e8400-e29b-41d4-a716-446655440000","body":{...}}
```

## Configuration

### Environment Variables

- `NODE_ENV`: Affects console logging format
- Log levels can be configured per transport

### Winston Configuration

- JSON format for structured logging
- Timestamp format: `YYYY-MM-DD HH:mm:ss`
- Error stack traces included
- Console output with colors for development

## Benefits

1. **Efficient Storage**: Application logs provide quick overview, trace logs for deep debugging
2. **Easy Correlation**: Request IDs link all related log entries
3. **Automatic Management**: Daily rotation and cleanup prevent disk space issues
4. **Safe Logging**: Handles complex objects and circular references
5. **Production Ready**: Structured JSON format suitable for log aggregation tools
6. **Development Friendly**: Colored console output for local development

## Usage Examples

### Finding All Logs for a Request

1. Find request in `application.log` by timestamp or endpoint
2. Extract the `requestId` from the application log entry
3. Search trace logs for the same `requestId` to get detailed information

### Debugging Failed Requests

1. Search `application.log` for error status codes (4xx, 5xx)
2. Use the `requestId` to find detailed error traces in trace logs
3. Examine request body, headers, and full stack trace

### Performance Analysis

1. Application logs contain response times for quick performance overview
2. Trace logs contain detailed timing information for deeper analysis
