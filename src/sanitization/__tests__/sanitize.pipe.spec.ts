import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ArgumentMetadata } from '@nestjs/common';
import { SanitizePipe } from '../sanitize.pipe';
import { SanitizerService } from '../sanitizer.service';
import { IS_HTML_KEY, SKIP_SANITIZE_KEY } from '../decorators';

describe('SanitizePipe', () => {
  let pipe: SanitizePipe;
  let sanitizerService: jest.Mocked<SanitizerService>;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(async () => {
    const mockSanitizerService = {
      normalizeString: jest.fn((str) => str?.trim?.() || str),
      sanitizeHtmlField: jest.fn(
        (str) => str?.replace(/<script.*?<\/script>/gi, '') || str,
      ),
      deepClean: jest.fn((obj) => obj),
    };

    const mockReflector = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SanitizePipe,
        { provide: SanitizerService, useValue: mockSanitizerService },
        { provide: Reflector, useValue: mockReflector },
      ],
    }).compile();

    pipe = module.get<SanitizePipe>(SanitizePipe);
    sanitizerService = module.get(SanitizerService);
    reflector = module.get(Reflector);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('transform', () => {
    it('should skip non-body parameters', () => {
      const metadata: ArgumentMetadata = { type: 'query' };
      const value = { test: 'value' };

      const result = pipe.transform(value, metadata);
      expect(result).toBe(value);
      expect(sanitizerService.normalizeString).not.toHaveBeenCalled();
    });

    it('should skip non-object values', () => {
      const metadata: ArgumentMetadata = { type: 'body' };
      const value = 'string value';

      const result = pipe.transform(value, metadata);
      expect(result).toBe(value);
      expect(sanitizerService.normalizeString).not.toHaveBeenCalled();
    });

    it('should sanitize object values', () => {
      const metadata: ArgumentMetadata = {
        type: 'body',
        metatype: class TestDto {},
      };
      const value = { title: '  test title  ', description: 'test desc' };

      reflector.get.mockReturnValue(false); // No special decorators

      const result = pipe.transform(value, metadata);

      expect(sanitizerService.normalizeString).toHaveBeenCalledWith(
        '  test title  ',
      );
      expect(sanitizerService.normalizeString).toHaveBeenCalledWith(
        'test desc',
      );
      expect(sanitizerService.deepClean).toHaveBeenCalled();
    });

    it('should handle HTML fields with @IsHtml decorator', () => {
      const metadata: ArgumentMetadata = {
        type: 'body',
        metatype: class TestDto {},
      };
      const value = { description: '<p>HTML content</p>' };

      // Mock Reflect.getMetadata directly since we're using it in the pipe
      jest
        .spyOn(Reflect, 'getMetadata')
        .mockImplementation((key, target, propertyKey) => {
          if (key === IS_HTML_KEY && propertyKey === 'description') {
            return true;
          }
          return false;
        });

      pipe.transform(value, metadata);

      expect(sanitizerService.sanitizeHtmlField).toHaveBeenCalledWith(
        '<p>HTML content</p>',
      );
    });

    it('should skip fields with @SkipSanitize decorator', () => {
      const metadata: ArgumentMetadata = {
        type: 'body',
        metatype: class TestDto {},
      };
      const value = { signedData: 'sensitive-data', title: 'normal title' };

      // Mock Reflect.getMetadata to return true only for signedData field
      jest
        .spyOn(Reflect, 'getMetadata')
        .mockImplementation((key, target, propertyKey) => {
          if (key === SKIP_SANITIZE_KEY && propertyKey === 'signedData') {
            return true;
          }
          return false;
        });

      pipe.transform(value, metadata);

      // signedData should be skipped, title should be sanitized
      expect(sanitizerService.normalizeString).not.toHaveBeenCalledWith(
        'sensitive-data',
      );
      expect(sanitizerService.normalizeString).toHaveBeenCalledWith(
        'normal title',
      );
    });

    it('should handle arrays correctly', () => {
      const metadata: ArgumentMetadata = {
        type: 'body',
        metatype: class TestDto {},
      };
      const value = { items: [{ name: '  item1  ' }, { name: '  item2  ' }] };

      reflector.get.mockReturnValue(false);

      pipe.transform(value, metadata);

      expect(sanitizerService.normalizeString).toHaveBeenCalledWith(
        '  item1  ',
      );
      expect(sanitizerService.normalizeString).toHaveBeenCalledWith(
        '  item2  ',
      );
    });

    it('should preserve non-string primitive values', () => {
      const metadata: ArgumentMetadata = {
        type: 'body',
        metatype: class TestDto {},
      };
      const value = {
        title: 'string value',
        count: 42,
        active: true,
        price: 19.99,
      };

      reflector.get.mockReturnValue(false);

      pipe.transform(value, metadata);

      expect(sanitizerService.normalizeString).toHaveBeenCalledWith(
        'string value',
      );
      expect(sanitizerService.normalizeString).toHaveBeenCalledTimes(1);
    });

    it('should handle reflection errors gracefully', () => {
      const metadata: ArgumentMetadata = {
        type: 'body',
        metatype: class TestDto {},
      };
      const value = { title: 'test' };

      reflector.get.mockImplementation(() => {
        throw new Error('Reflection failed');
      });

      expect(() => pipe.transform(value, metadata)).not.toThrow();
      expect(sanitizerService.normalizeString).toHaveBeenCalledWith('test');
    });

    it('should handle sanitization errors gracefully', () => {
      const metadata: ArgumentMetadata = {
        type: 'body',
        metatype: class TestDto {},
      };
      const value = { title: 'test' };

      sanitizerService.deepClean.mockImplementation(() => {
        throw new Error('Sanitization failed');
      });

      const result = pipe.transform(value, metadata);
      expect(result).toBe(value); // Should return original value on error
    });

    it('should handle nested objects correctly', () => {
      const metadata: ArgumentMetadata = {
        type: 'body',
        metatype: class TestDto {},
      };
      const value = {
        user: {
          name: '  John Doe  ',
          profile: {
            bio: '  Developer  ',
          },
        },
      };

      reflector.get.mockReturnValue(false);

      pipe.transform(value, metadata);

      expect(sanitizerService.normalizeString).toHaveBeenCalledWith(
        '  John Doe  ',
      );
      expect(sanitizerService.normalizeString).toHaveBeenCalledWith(
        '  Developer  ',
      );
    });
  });
});
