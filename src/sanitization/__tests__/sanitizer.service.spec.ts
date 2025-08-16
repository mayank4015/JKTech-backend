import { Test, TestingModule } from '@nestjs/testing';
import { SanitizerService } from '../sanitizer.service';

describe('SanitizerService', () => {
  let service: SanitizerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SanitizerService],
    }).compile();

    service = module.get<SanitizerService>(SanitizerService);
  });

  describe('normalizeString', () => {
    it('should trim whitespace', () => {
      expect(service.normalizeString('  hello world  ')).toBe('hello world');
    });

    it('should collapse multiple spaces', () => {
      expect(service.normalizeString('hello    world')).toBe('hello world');
    });

    it('should handle mixed whitespace characters', () => {
      expect(service.normalizeString('hello\t\n  world')).toBe('hello world');
    });

    it('should return non-string values unchanged', () => {
      expect(service.normalizeString(123 as any)).toBe(123);
      expect(service.normalizeString(null as any)).toBe(null);
    });
  });

  describe('sanitizeHTML', () => {
    it('should allow safe HTML tags', () => {
      const input = '<p>Hello <strong>world</strong></p>';
      const result = service.sanitizeHTML(input);
      expect(result).toContain('<p>');
      expect(result).toContain('<strong>');
    });

    it('should remove dangerous HTML tags', () => {
      const input = '<script>alert("xss")</script><p>Safe content</p>';
      const result = service.sanitizeHTML(input);
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('alert');
      expect(result).toContain('<p>');
    });

    it('should remove dangerous attributes', () => {
      const input = '<p onclick="alert(\'xss\')">Hello</p>';
      const result = service.sanitizeHTML(input);
      expect(result).not.toContain('onclick');
      expect(result).toContain('<p>');
    });

    it('should handle malformed HTML gracefully', () => {
      const input = '<p>Unclosed tag';
      const result = service.sanitizeHTML(input);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should return non-string values unchanged', () => {
      expect(service.sanitizeHTML(123 as any)).toBe(123);
    });
  });

  describe('deepClean', () => {
    it('should normalize strings in nested objects', () => {
      const input = {
        title: '  hello world  ',
        nested: {
          description: 'test   content',
        },
      };

      const result = service.deepClean(input);
      expect(result.title).toBe('hello world');
      expect(result.nested.description).toBe('test content');
    });

    it('should remove dangerous MongoDB operators', () => {
      const input = {
        title: 'Safe title',
        $where: 'malicious code',
        'field.with.dots': 'dangerous',
        $ne: 'injection attempt',
        safeField: 'safe value',
      };

      const result = service.deepClean(input);
      expect(result.title).toBe('Safe title');
      expect(result.safeField).toBe('safe value');
      expect(result.$where).toBeUndefined();
      expect(result['field.with.dots']).toBeUndefined();
      expect(result.$ne).toBeUndefined();
    });

    it('should handle arrays correctly', () => {
      const input = {
        tags: ['  tag1  ', 'tag2   ', '  tag3'],
        nested: [{ name: '  item1  ' }, { name: 'item2   ' }],
      };

      const result = service.deepClean(input);
      expect(result.tags).toEqual(['tag1', 'tag2', 'tag3']);
      expect(result.nested[0].name).toBe('item1');
      expect(result.nested[1].name).toBe('item2');
    });

    it('should preserve non-string primitive types', () => {
      const input = {
        count: 42,
        active: true,
        price: 19.99,
        date: new Date('2023-01-01'),
        nullValue: null,
        undefinedValue: undefined,
      };

      const result = service.deepClean(input);
      expect(result.count).toBe(42);
      expect(result.active).toBe(true);
      expect(result.price).toBe(19.99);
      expect(result.date).toEqual(new Date('2023-01-01'));
      expect(result.nullValue).toBe(null);
      expect(result.undefinedValue).toBe(undefined);
    });

    it('should handle circular references safely', () => {
      const input: any = { name: 'test' };
      input.self = input; // Create circular reference

      // This test should not cause infinite loops
      expect(() => service.deepClean(input)).not.toThrow();
    });

    it('should handle deeply nested objects', () => {
      const input = {
        level1: {
          level2: {
            level3: {
              value: '  deep value  ',
              $dangerous: 'should be removed',
            },
          },
        },
      };

      const result = service.deepClean(input);
      expect(result.level1.level2.level3.value).toBe('deep value');
      expect(result.level1.level2.level3.$dangerous).toBeUndefined();
    });
  });

  describe('sanitizeHtmlField', () => {
    it('should normalize and sanitize HTML', () => {
      const input = '  <p>Hello <script>alert("xss")</script> world</p>  ';
      const result = service.sanitizeHtmlField(input);

      expect(result).not.toContain('<script>');
      expect(result).toContain('<p>');
      expect(result.trim()).toBe(result); // Should be trimmed
    });

    it('should handle non-string input', () => {
      expect(service.sanitizeHtmlField(123 as any)).toBe(123);
    });
  });

  describe('getConfig', () => {
    it('should return configuration object', () => {
      const config = service.getConfig();

      expect(config).toHaveProperty('htmlSanitizationEnabled');
      expect(config).toHaveProperty('htmlAllowlist');
      expect(config).toHaveProperty('redactFields');
      expect(config).toHaveProperty('mongoProtectionEnabled');

      expect(Array.isArray(config.htmlAllowlist)).toBe(true);
      expect(Array.isArray(config.redactFields)).toBe(true);
    });
  });
});
