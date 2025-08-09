import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { LoggerService } from '../common/logger/logger.service';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import {
  mockUser,
  createUserDto,
  expectedUserCreateResponse,
} from './test-fixtures/user-test-data';

describe('UsersService Performance Tests', () => {
  let service: UsersService;
  let authService: DeepMockProxy<AuthService>;
  let prismaService: DeepMockProxy<PrismaService>;
  let module: TestingModule;

  // Set timeout for performance tests
  jest.setTimeout(15000);

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: AuthService,
          useValue: mockDeep<AuthService>(),
        },
        {
          provide: PrismaService,
          useValue: mockDeep<PrismaService>(),
        },
        {
          provide: LoggerService,
          useValue: mockDeep<LoggerService>(),
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    authService = module.get(AuthService);
    prismaService = module.get(PrismaService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await module.close();
  });

  describe('Concurrency Performance', () => {
    it('should handle 100 concurrent user creations within 2 seconds', async () => {
      const startTime = performance.now();

      const promises = Array(100)
        .fill(null)
        .map((_, i) =>
          service.createUserByAdmin({
            ...createUserDto,
            email: `user${i}@example.com`,
          }),
        );

      authService.createUser.mockResolvedValue(expectedUserCreateResponse);

      await Promise.all(promises);

      const endTime = performance.now();
      const executionTime = endTime - startTime;

      console.log(
        `✅ 100 concurrent user creations took ${executionTime.toFixed(2)}ms`,
      );
      expect(executionTime).toBeLessThan(2000); // 2 seconds max
      expect(authService.createUser).toHaveBeenCalledTimes(100);
    });

    it('should handle large pagination efficiently', async () => {
      const largeUserSet = Array(1000).fill(mockUser);
      prismaService.user.findMany.mockResolvedValue(largeUserSet.slice(0, 50));
      prismaService.user.count.mockResolvedValue(10000);

      const startTime = performance.now();

      await service.getAllUsers(1, 50);

      const endTime = performance.now();
      const executionTime = endTime - startTime;

      console.log(`✅ Large pagination took ${executionTime.toFixed(2)}ms`);
      expect(executionTime).toBeLessThan(50); // 50ms max
    });

    it('should handle concurrent read operations efficiently', async () => {
      prismaService.user.findMany.mockResolvedValue([mockUser]);
      prismaService.user.count.mockResolvedValue(1);

      const startTime = performance.now();

      const readPromises = Array(50)
        .fill(null)
        .map(() => service.getAllUsers(1, 10));

      await Promise.all(readPromises);

      const endTime = performance.now();
      const executionTime = endTime - startTime;

      console.log(`✅ 50 concurrent reads took ${executionTime.toFixed(2)}ms`);
      expect(executionTime).toBeLessThan(1000); // 1 second max
    });
  });

  describe('Memory Performance', () => {
    it('should not leak memory during bulk operations', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      authService.createUser.mockResolvedValue(expectedUserCreateResponse);

      // Perform bulk operations
      for (let i = 0; i < 500; i++) {
        await service.createUserByAdmin({
          ...createUserDto,
          email: `test${i}@example.com`,
        });
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreaseMB = memoryIncrease / (1024 * 1024);

      console.log(
        `✅ Memory increase after 500 operations: ${memoryIncreaseMB.toFixed(2)}MB`,
      );

      // Memory increase should be reasonable (< 10MB for 500 operations)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe('Query Optimization', () => {
    it('should use efficient database queries', async () => {
      const mockFindMany = prismaService.user.findMany;
      const mockCount = prismaService.user.count;

      mockFindMany.mockResolvedValue([mockUser]);
      mockCount.mockResolvedValue(1);

      const startTime = performance.now();

      await service.getAllUsers(1, 10, { search: 'test', role: 'editor' });

      const endTime = performance.now();
      const executionTime = endTime - startTime;

      console.log(`✅ Complex query took ${executionTime.toFixed(2)}ms`);

      // Verify query structure is optimized
      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { name: { contains: 'test', mode: 'insensitive' } },
            { email: { contains: 'test', mode: 'insensitive' } },
          ],
          role: 'editor',
        },
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Query should be fast
      expect(executionTime).toBeLessThan(10); // 10ms max
    });
  });

  describe('Scalability Tests', () => {
    it('should maintain performance with increasing load', async () => {
      authService.createUser.mockResolvedValue(expectedUserCreateResponse);

      const loadSizes = [10, 50, 100];
      const results: Array<{
        load: number;
        totalTime: number;
        avgTime: number;
      }> = [];

      for (const size of loadSizes) {
        const startTime = performance.now();

        const promises = Array(size)
          .fill(null)
          .map((_, i) =>
            service.createUserByAdmin({
              ...createUserDto,
              email: `load${size}_${i}@example.com`,
            }),
          );

        await Promise.all(promises);

        const endTime = performance.now();
        const executionTime = endTime - startTime;
        const avgTimePerOperation = executionTime / size;

        results.push({
          load: size,
          totalTime: executionTime,
          avgTime: avgTimePerOperation,
        });

        console.log(
          `✅ Load ${size}: ${executionTime.toFixed(2)}ms total, ${avgTimePerOperation.toFixed(2)}ms avg`,
        );
      }

      // Performance should scale linearly (not exponentially)
      const efficiency = results[2].avgTime / results[0].avgTime;
      expect(efficiency).toBeLessThan(2); // Should not double the time per operation
    });
  });
});
