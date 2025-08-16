import { Test, TestingModule } from '@nestjs/testing';
import { TokenBlacklistService } from './token-blacklist.service';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { LoggerService } from '../../common/logger/logger.service';
import { AppConfigService } from '../../config/app-config.service';

describe('TokenBlacklistService', () => {
  let service: TokenBlacklistService;
  let mockRedis: any;
  let mockLogger: any;
  let mockConfig: any;

  beforeEach(async () => {
    mockRedis = {
      setex: jest.fn(),
      get: jest.fn(),
      scan: jest.fn(),
      info: jest.fn(),
    };

    mockLogger = {
      debug: jest.fn(),
      error: jest.fn(),
    };

    mockConfig = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenBlacklistService,
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: LoggerService, useValue: mockLogger },
        { provide: AppConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<TokenBlacklistService>(TokenBlacklistService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('blacklistToken', () => {
    it('should blacklist a token with valid TTL', async () => {
      const jti = 'test-jti';
      const exp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      await service.blacklistToken(jti, exp);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        `blacklist:${jti}`,
        expect.any(Number),
        '1',
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining(`Token blacklisted: ${jti}`),
      );
    });

    it('should not blacklist an expired token', async () => {
      const jti = 'test-jti';
      const exp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

      await service.blacklistToken(jti, exp);

      expect(mockRedis.setex).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Token already expired, not blacklisting: ${jti}`,
      );
    });

    it('should handle Redis errors gracefully', async () => {
      const jti = 'test-jti';
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const error = new Error('Redis error');

      mockRedis.setex.mockRejectedValue(error);

      await service.blacklistToken(jti, exp);

      expect(mockLogger.error).toHaveBeenCalledWith(
        `Failed to blacklist token ${jti}:`,
        error,
      );
    });
  });

  describe('isTokenBlacklisted', () => {
    it('should return true for blacklisted token', async () => {
      const jti = 'test-jti';
      mockRedis.get.mockResolvedValue('1');

      const result = await service.isTokenBlacklisted(jti);

      expect(result).toBe(true);
      expect(mockRedis.get).toHaveBeenCalledWith(`blacklist:${jti}`);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Token is blacklisted: ${jti}`,
      );
    });

    it('should return false for non-blacklisted token', async () => {
      const jti = 'test-jti';
      mockRedis.get.mockResolvedValue(null);

      const result = await service.isTokenBlacklisted(jti);

      expect(result).toBe(false);
      expect(mockRedis.get).toHaveBeenCalledWith(`blacklist:${jti}`);
    });

    it('should return false on Redis error', async () => {
      const jti = 'test-jti';
      const error = new Error('Redis error');
      mockRedis.get.mockRejectedValue(error);

      const result = await service.isTokenBlacklisted(jti);

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        `Failed to check token blacklist for ${jti}:`,
        error,
      );
    });
  });

  describe('getBlacklistStats', () => {
    it('should return blacklist statistics', async () => {
      mockRedis.scan
        .mockResolvedValueOnce(['0', ['blacklist:token1', 'blacklist:token2']])
        .mockResolvedValueOnce(['0', []]);
      mockRedis.info.mockResolvedValue('used_memory_human:1.5M\n');

      const result = await service.getBlacklistStats();

      expect(result).toEqual({
        count: 2,
        memoryUsage: '1.5M',
      });
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Redis error');
      mockRedis.scan.mockRejectedValue(error);

      const result = await service.getBlacklistStats();

      expect(result).toEqual({
        count: 0,
        memoryUsage: '0 KB',
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get blacklist stats:',
        error,
      );
    });
  });
});
