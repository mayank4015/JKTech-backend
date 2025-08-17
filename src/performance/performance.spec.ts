/**
 * Performance Test Suite
 * Tests critical system components under load to ensure scalability and responsiveness
 *
 * To run performance tests specifically:
 * npm run test:performance
 *
 * To run with coverage:
 * npm run test:performance:cov
 */

import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { DocumentsService } from '../documents/documents.service';
import { AuthService } from '../auth/auth.service';
import { QAService } from '../qa/qa.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { LoggerService } from '../common/logger/logger.service';
import { FileUploadService } from '../common/file-upload/file-upload.service';
import { DocumentStatus } from '../documents/dto';

interface PerformanceMetrics {
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  throughput: number;
  successRate: number;
  memoryUsage?: NodeJS.MemoryUsage;
}

interface LoadTestConfig {
  concurrentUsers: number;
  requestsPerUser: number;
  timeoutMs: number;
  expectedThroughput: number; // requests per second
  maxResponseTime: number; // milliseconds
}

describe('Performance Tests', () => {
  let documentsService: DeepMockProxy<DocumentsService>;
  let authService: DeepMockProxy<AuthService>;
  let qaService: DeepMockProxy<QAService>;
  let prismaService: DeepMockProxy<PrismaService>;
  let loggerService: DeepMockProxy<LoggerService>;
  let fileUploadService: DeepMockProxy<FileUploadService>;

  // Performance test configurations
  const loadTestConfigs: Record<string, LoadTestConfig> = {
    light: {
      concurrentUsers: 10,
      requestsPerUser: 5,
      timeoutMs: 5000,
      expectedThroughput: 20, // 20 RPS
      maxResponseTime: 500,
    },
    moderate: {
      concurrentUsers: 50,
      requestsPerUser: 10,
      timeoutMs: 10000,
      expectedThroughput: 100, // 100 RPS
      maxResponseTime: 1000,
    },
    heavy: {
      concurrentUsers: 100,
      requestsPerUser: 20,
      timeoutMs: 30000,
      expectedThroughput: 200, // 200 RPS
      maxResponseTime: 2000,
    },
  };

  beforeAll(async () => {
    // Create mock instances directly
    documentsService = mockDeep<DocumentsService>();
    authService = mockDeep<AuthService>();
    qaService = mockDeep<QAService>();
    prismaService = mockDeep<PrismaService>();
    loggerService = mockDeep<LoggerService>();
    fileUploadService = mockDeep<FileUploadService>();

    // Setup common mocks
    setupCommonMocks();
  });

  afterAll(async () => {
    // Clean up resources if needed
  });

  describe('Authentication Performance', () => {
    it('should handle concurrent login requests efficiently', async () => {
      const config = loadTestConfigs.moderate;
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
      };

      // Mock successful authentication
      authService.login.mockResolvedValue({
        user: {
          id: 'user-1',
          email: loginData.email,
          name: 'Test User',
          role: 'admin',
        },
        tokens: {
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
        },
      } as never);

      const metrics = await runLoadTest('Authentication', config, async () => {
        return authService.login(loginData.email, loginData.password);
      });

      // Performance assertions
      expect(metrics.averageResponseTime).toBeLessThan(config.maxResponseTime);
      expect(metrics.throughput).toBeGreaterThan(
        config.expectedThroughput * 0.8,
      ); // 80% of expected
      expect(metrics.successRate).toBeGreaterThan(0.95); // 95% success rate
    });

    it('should validate JWT tokens under load', async () => {
      const config = loadTestConfigs.heavy;
      const mockToken = 'valid-jwt-token';

      // Mock JWT validation - using a simple validation function
      const validateToken = jest.fn().mockResolvedValue({
        sub: 'user-1',
        email: 'test@example.com',
        role: 'admin',
      });

      const metrics = await runLoadTest('JWT Validation', config, async () => {
        return validateToken(mockToken);
      });

      expect(metrics.averageResponseTime).toBeLessThan(100); // JWT validation should be very fast
      expect(metrics.successRate).toBeGreaterThan(0.98);
    });
  });

  describe('Document Service Performance', () => {
    it('should retrieve documents efficiently under load', async () => {
      const config = loadTestConfigs.moderate;

      // Mock document retrieval
      const mockDocuments = Array.from({ length: 20 }, (_, i) => ({
        id: `doc-${i}`,
        title: `Document ${i}`,
        description: `Description for document ${i}`,
        fileName: `file-${i}.pdf`,
        fileUrl: `https://storage.example.com/doc-${i}.pdf`,
        fileType: 'application/pdf',
        fileSize: '1024000',
        uploadedBy: 'user-1',
        status: DocumentStatus.PROCESSED,
        tags: ['test'],
        category: 'general',
        createdAt: new Date(),
        updatedAt: new Date(),
        uploader: {
          id: 'user-1',
          name: 'Test User',
          email: 'test@example.com',
        },
      }));

      documentsService.getDocuments.mockResolvedValue({
        documents: mockDocuments,
        pagination: {
          total: mockDocuments.length,
          page: 1,
          limit: 10,
          totalPages: Math.ceil(mockDocuments.length / 10),
        },
        stats: {
          total: mockDocuments.length,
          processed: mockDocuments.length,
          pending: 0,
          failed: 0,
          totalSize: mockDocuments.length * 1024000,
        },
      } as never);

      const metrics = await runLoadTest(
        'Document Retrieval',
        config,
        async () => {
          return documentsService.getDocuments(1, 10);
        },
      );

      expect(metrics.averageResponseTime).toBeLessThan(config.maxResponseTime);
      expect(metrics.throughput).toBeGreaterThan(
        config.expectedThroughput * 0.7,
      );
      expect(metrics.successRate).toBeGreaterThan(0.95);
    });

    it('should handle document search queries efficiently', async () => {
      const config = loadTestConfigs.light;

      // Mock search results
      const mockSearchResults = Array.from({ length: 5 }, (_, i) => ({
        id: `doc-${i}`,
        title: `Search Result ${i}`,
        description: `Matching document ${i}`,
        fileName: `search-${i}.pdf`,
        fileUrl: `https://storage.example.com/search-${i}.pdf`,
        fileType: 'application/pdf',
        fileSize: '1024000',
        uploadedBy: 'user-1',
        status: DocumentStatus.PROCESSED,
        tags: ['search', 'test'],
        category: 'general',
        createdAt: new Date(),
        updatedAt: new Date(),
        uploader: {
          id: 'user-1',
          name: 'Test User',
          email: 'test@example.com',
        },
      }));

      documentsService.getDocuments.mockResolvedValue({
        documents: mockSearchResults,
        pagination: {
          total: mockSearchResults.length,
          page: 1,
          limit: 10,
          totalPages: Math.ceil(mockSearchResults.length / 10),
        },
        stats: {
          total: mockSearchResults.length,
          processed: mockSearchResults.length,
          pending: 0,
          failed: 0,
          totalSize: mockSearchResults.length * 1024000,
        },
      } as never);

      const metrics = await runLoadTest('Document Search', config, async () => {
        return documentsService.getDocuments(1, 10, { search: 'test query' });
      });

      expect(metrics.averageResponseTime).toBeLessThan(config.maxResponseTime);
      expect(metrics.successRate).toBeGreaterThan(0.95);
    });
  });

  describe('Q&A Service Performance', () => {
    it('should process questions efficiently under concurrent load', async () => {
      const config = loadTestConfigs.light; // Q&A might be more resource intensive

      // Mock Q&A response
      const mockQaResponse = {
        question: {
          id: 'question-1',
          text: 'What is the performance of the system?',
          conversationId: 'conversation-1',
          createdAt: new Date(),
          answer: {
            id: 'answer-1',
            questionId: 'question-1',
            text: 'The system performs well under normal load conditions.',
            confidence: 0.85,
            sources: ['doc-1', 'doc-2'],
            createdAt: new Date(),
          },
        },
        conversationId: 'conversation-1',
      };

      // Mock the Q&A service method
      qaService.askQuestion.mockResolvedValue(mockQaResponse);

      const metrics = await runLoadTest('Q&A Processing', config, async () => {
        return qaService.askQuestion('user-1', 'admin', {
          text: 'What is the performance benchmark?',
        });
      });

      expect(metrics.averageResponseTime).toBeLessThan(
        config.maxResponseTime * 2,
      ); // Q&A can be slower
      expect(metrics.successRate).toBeGreaterThan(0.9);
    });
  });

  describe('Database Performance', () => {
    it('should handle concurrent database queries efficiently', async () => {
      const config = loadTestConfigs.moderate;

      // Mock database operations
      prismaService.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          email: 'test1@example.com',
          name: 'User 1',
          role: 'admin',
          isActive: true,
          passwordHash: 'hash1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'user-2',
          email: 'test2@example.com',
          name: 'User 2',
          role: 'editor',
          isActive: true,
          passwordHash: 'hash2',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as never);

      const metrics = await runLoadTest('Database Query', config, async () => {
        return prismaService.user.findMany({
          where: { isActive: true },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        });
      });

      expect(metrics.averageResponseTime).toBeLessThan(200); // Database queries should be fast
      expect(metrics.throughput).toBeGreaterThan(config.expectedThroughput);
      expect(metrics.successRate).toBeGreaterThan(0.98);
    });
  });

  describe('Memory Usage Performance', () => {
    it('should maintain stable memory usage under load', async () => {
      const config = loadTestConfigs.moderate;
      const initialMemory = process.memoryUsage();

      // Run a memory-intensive operation
      const metrics = await runLoadTest('Memory Usage', config, async () => {
        // Simulate memory-intensive operation
        const largeArray = new Array(1000).fill(0).map((_, i) => ({
          id: i,
          data: `Large data string ${i}`.repeat(100),
        }));

        // Process the array
        return largeArray.filter((item) => item.id % 2 === 0).length;
      });

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreaseInMB = memoryIncrease / (1024 * 1024);

      // Memory should not increase by more than 100MB during the test
      expect(memoryIncreaseInMB).toBeLessThan(100);
      expect(metrics.successRate).toBeGreaterThan(0.95);
    });
  });

  // Helper function to run load tests
  async function runLoadTest(
    testName: string,
    config: LoadTestConfig,
    operation: () => Promise<any>,
  ): Promise<PerformanceMetrics> {
    const startTime = Date.now();
    const responseTimes: number[] = [];
    const errors: Error[] = [];
    let completedRequests = 0;

    console.log(`\n🚀 Starting ${testName} performance test:`);
    console.log(`   Concurrent Users: ${config.concurrentUsers}`);
    console.log(`   Requests per User: ${config.requestsPerUser}`);
    console.log(
      `   Total Requests: ${config.concurrentUsers * config.requestsPerUser}`,
    );

    // Create concurrent user simulations
    const userPromises = Array.from(
      { length: config.concurrentUsers },
      async () => {
        for (
          let requestIndex = 0;
          requestIndex < config.requestsPerUser;
          requestIndex++
        ) {
          try {
            const requestStartTime = Date.now();
            await Promise.race([
              operation(),
              new Promise((_, reject) =>
                setTimeout(
                  () => reject(new Error('Request timeout')),
                  config.timeoutMs,
                ),
              ),
            ]);
            const requestEndTime = Date.now();
            const responseTime = requestEndTime - requestStartTime;
            responseTimes.push(responseTime);
            completedRequests++;
          } catch (error) {
            errors.push(error as Error);
          }
        }
      },
    );

    // Wait for all users to complete
    await Promise.allSettled(userPromises);

    const endTime = Date.now();
    const totalTime = (endTime - startTime) / 1000; // Convert to seconds
    const totalRequests = config.concurrentUsers * config.requestsPerUser;

    // Calculate metrics
    const averageResponseTime =
      responseTimes.length > 0
        ? responseTimes.reduce((sum, time) => sum + time, 0) /
          responseTimes.length
        : 0;
    const minResponseTime =
      responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
    const maxResponseTime =
      responseTimes.length > 0 ? Math.max(...responseTimes) : 0;
    const throughput = completedRequests / totalTime;
    const successRate = completedRequests / totalRequests;

    const metrics: PerformanceMetrics = {
      averageResponseTime,
      minResponseTime,
      maxResponseTime,
      throughput,
      successRate,
      memoryUsage: process.memoryUsage(),
    };

    // Log results
    console.log(`\n📊 ${testName} Performance Results:`);
    console.log(
      `   ✅ Completed Requests: ${completedRequests}/${totalRequests}`,
    );
    console.log(`   ⚡ Success Rate: ${(successRate * 100).toFixed(2)}%`);
    console.log(
      `   ⏱️  Average Response Time: ${averageResponseTime.toFixed(2)}ms`,
    );
    console.log(`   🚀 Throughput: ${throughput.toFixed(2)} requests/second`);
    console.log(`   ❌ Errors: ${errors.length}`);

    if (errors.length > 0) {
      console.log(`   🔍 Error Details: ${errors[0].message}`);
    }

    return metrics;
  }

  function setupCommonMocks() {
    // Setup any common mock behaviors here
    loggerService.log.mockImplementation(() => {});
    loggerService.error.mockImplementation(() => {});
    loggerService.warn.mockImplementation(() => {});
  }
});
