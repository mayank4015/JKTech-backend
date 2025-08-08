import { safeStringify, safeParse, sanitizeForLogging } from './safe-json.util';

describe('Safe JSON Utility', () => {
  describe('safeStringify', () => {
    describe('Positive Cases', () => {
      it('should stringify simple objects', () => {
        const obj = { name: 'test', age: 25 };
        const result = safeStringify(obj);

        expect(result).toBe('{"name":"test","age":25}');
      });

      it('should stringify arrays', () => {
        const arr = [1, 2, 'three', { four: 4 }];
        const result = safeStringify(arr);

        expect(result).toBe('[1,2,"three",{"four":4}]');
      });

      it('should handle null and undefined values', () => {
        const obj = { a: null, b: undefined, c: 'value' };
        const result = safeStringify(obj);

        expect(result).toBe('{"a":null,"b":"[Undefined]","c":"value"}');
      });

      it('should handle BigInt values', () => {
        const obj = { id: BigInt(123456789), name: 'test' };
        const result = safeStringify(obj);

        expect(result).toBe('{"id":"123456789","name":"test"}');
      });

      it('should handle functions', () => {
        const obj = {
          name: 'test',
          method: function () {
            return 'hello';
          },
          arrow: () => 'world',
        };
        const result = safeStringify(obj);

        expect(result).toBe(
          '{"name":"test","method":"[Function]","arrow":"[Function]"}',
        );
      });

      it('should handle symbols', () => {
        const sym = Symbol('test');
        const obj = { name: 'test', symbol: sym };
        const result = safeStringify(obj);

        expect(result).toBe('{"name":"test","symbol":"Symbol(test)"}');
      });

      it('should handle Error objects', () => {
        const error = new Error('Test error');
        (error as Error & { code: string }).code = 'TEST_ERROR';
        const obj = { error };
        const result = safeStringify(obj);

        const parsed = JSON.parse(result) as {
          error: { name: string; message: string; code: string; stack: string };
        };
        expect(parsed.error.name).toBe('Error');
        expect(parsed.error.message).toBe('Test error');
        expect(parsed.error.code).toBe('TEST_ERROR');
        expect(parsed.error.stack).toBeDefined();
      });

      it('should handle custom Error types', () => {
        class CustomError extends Error {
          constructor(
            message: string,
            public statusCode: number,
          ) {
            super(message);
            this.name = 'CustomError';
          }
        }

        const error = new CustomError('Custom error message', 400);
        const result = safeStringify({ error });

        const parsed = JSON.parse(result) as {
          error: { name: string; message: string; statusCode: number };
        };
        expect(parsed.error.name).toBe('CustomError');
        expect(parsed.error.message).toBe('Custom error message');
        expect(parsed.error.statusCode).toBe(400);
      });

      it('should format with spacing when specified', () => {
        const obj = { name: 'test', age: 25 };
        const result = safeStringify(obj, 2);

        expect(result).toBe('{\n  "name": "test",\n  "age": 25\n}');
      });

      it('should handle Date objects', () => {
        const date = new Date('2024-01-01T00:00:00.000Z');
        const obj = { createdAt: date };
        const result = safeStringify(obj);

        expect(result).toBe('{"createdAt":"2024-01-01T00:00:00.000Z"}');
      });

      it('should handle nested objects', () => {
        const obj = {
          user: {
            profile: {
              name: 'test',
              settings: {
                theme: 'dark',
                notifications: true,
              },
            },
          },
        };
        const result = safeStringify(obj);

        expect(JSON.parse(result)).toEqual(obj);
      });
    });

    describe('Negative Cases', () => {
      it('should handle circular references', () => {
        const obj: Record<string, unknown> = { name: 'test' };
        obj.self = obj; // Create circular reference

        const result = safeStringify(obj);

        expect(result).toBe('{"name":"test","self":"[Circular Reference]"}');
      });

      it('should handle complex circular references', () => {
        const parent: Record<string, unknown> = { name: 'parent' };
        const child: Record<string, unknown> = { name: 'child', parent };
        parent.child = child;

        const result = safeStringify(parent);

        const parsed = JSON.parse(result) as {
          name: string;
          child: { name: string; parent: string };
        };
        expect(parsed.name).toBe('parent');
        expect(parsed.child.name).toBe('child');
        expect(parsed.child.parent).toBe('[Circular Reference]');
      });

      it('should handle objects that throw during property access', () => {
        const obj = {
          name: 'test',
          get problematic() {
            throw new Error('Property access error');
          },
        };

        // Should not throw and should handle the error gracefully
        expect(() => safeStringify(obj)).not.toThrow();
      });

      it('should handle very large objects', () => {
        const largeObj: Record<string, string> = {};
        for (let i = 0; i < 10000; i++) {
          largeObj[`key${i}`] = `value${i}`;
        }

        const result = safeStringify(largeObj);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      });

      it('should handle objects with non-enumerable properties', () => {
        const obj = { name: 'test' };
        Object.defineProperty(obj, 'hidden', {
          value: 'secret',
          enumerable: false,
        });

        const result = safeStringify(obj);
        expect(result).toBe('{"name":"test"}');
      });

      it('should return error message when stringify completely fails', () => {
        // Mock JSON.stringify to throw
        const originalStringify = JSON.stringify;
        JSON.stringify = jest.fn(() => {
          throw new Error('Stringify failed');
        });

        const result = safeStringify({ test: 'value' });
        expect(result).toBe('[Stringify Error: Unable to stringify object]');

        // Restore original
        JSON.stringify = originalStringify;
      });
    });
  });

  describe('safeParse', () => {
    describe('Positive Cases', () => {
      it('should parse valid JSON strings', () => {
        const jsonString = '{"name":"test","age":25}';
        const result = safeParse<{ name: string; age: number }>(jsonString);

        expect(result).toEqual({ name: 'test', age: 25 });
      });

      it('should parse JSON arrays', () => {
        const jsonString = '[1,2,3,"four"]';
        const result = safeParse<(number | string)[]>(jsonString);

        expect(result).toEqual([1, 2, 3, 'four']);
      });

      it('should parse primitive JSON values', () => {
        expect(safeParse<boolean>('true')).toBe(true);
        expect(safeParse<boolean>('false')).toBe(false);
        expect(safeParse<null>('null')).toBeNull();
        expect(safeParse<number>('123')).toBe(123);
        expect(safeParse<string>('"string"')).toBe('string');
      });

      it('should parse nested JSON objects', () => {
        const jsonString = '{"user":{"profile":{"name":"test","age":25}}}';
        const result = safeParse<{
          user: {
            profile: {
              name: string;
              age: number;
            };
          };
        }>(jsonString);

        expect(result).toEqual({
          user: {
            profile: {
              name: 'test',
              age: 25,
            },
          },
        });
      });

      it('should parse empty objects and arrays', () => {
        expect(safeParse<Record<string, never>>('{}')).toEqual({});
        expect(safeParse<never[]>('[]')).toEqual([]);
      });
    });

    describe('Negative Cases', () => {
      it('should return null for invalid JSON', () => {
        const invalidJson = '{"name": test}'; // Missing quotes around test
        const result = safeParse(invalidJson);

        expect(result).toBeNull();
      });

      it('should return null for malformed JSON', () => {
        const malformedJson = '{"name":"test",}'; // Trailing comma
        const result = safeParse(malformedJson);

        expect(result).toBeNull();
      });

      it('should return null for non-JSON strings', () => {
        expect(safeParse('not json at all')).toBeNull();
        expect(safeParse('undefined')).toBeNull();
        expect(safeParse('function() {}')).toBeNull();
      });

      it('should return null for empty strings', () => {
        expect(safeParse('')).toBeNull();
      });

      it('should return null for strings with only whitespace', () => {
        expect(safeParse('   ')).toBeNull();
        expect(safeParse('\n\t')).toBeNull();
      });

      it('should handle very large JSON strings', () => {
        const largeArray = Array.from({ length: 100000 }, (_, i) => i);
        const largeJsonString = JSON.stringify(largeArray);

        const result = safeParse<number[]>(largeJsonString);
        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(100000);
      });

      it('should handle JSON with special characters', () => {
        const jsonWithSpecialChars =
          '{"text":"Hello\\nWorld\\t!","emoji":"🚀"}';
        const result = safeParse<{ text: string; emoji: string }>(
          jsonWithSpecialChars,
        );

        expect(result).toEqual({
          text: 'Hello\nWorld\t!',
          emoji: '🚀',
        });
      });
    });
  });

  describe('sanitizeForLogging', () => {
    describe('Positive Cases', () => {
      it('should preserve non-sensitive data', () => {
        const obj = {
          name: 'John Doe',
          email: 'john@example.com',
          age: 30,
          preferences: {
            theme: 'dark',
            language: 'en',
          },
        };

        const result = sanitizeForLogging(obj);
        expect(result).toEqual(obj);
      });

      it('should handle arrays of objects', () => {
        const arr = [
          { name: 'John', password: 'secret123' },
          { name: 'Jane', token: 'abc123' },
        ];

        const result = sanitizeForLogging(arr);
        expect(result).toEqual([
          { name: 'John', password: '[REDACTED]' },
          { name: 'Jane', token: '[REDACTED]' },
        ]);
      });

      it('should handle nested objects', () => {
        const obj = {
          user: {
            name: 'John',
            auth: {
              password: 'secret123',
              apiKey: 'key123',
            },
          },
          metadata: {
            version: '1.0',
          },
        };

        const result = sanitizeForLogging(obj);
        expect(result).toEqual({
          user: {
            name: 'John',
            auth: {
              password: '[REDACTED]',
              apiKey: '[REDACTED]',
            },
          },
          metadata: {
            version: '1.0',
          },
        });
      });

      it('should handle null and undefined values', () => {
        const obj = {
          name: 'test',
          password: null,
          token: undefined,
          data: 'safe',
        };

        const result = sanitizeForLogging(obj);
        expect(result).toEqual({
          name: 'test',
          password: '[REDACTED]', // Sensitive keys are redacted regardless of value
          token: '[REDACTED]', // Sensitive keys are redacted regardless of value
          data: 'safe',
        });
      });
    });

    describe('Negative Cases', () => {
      it('should redact password fields', () => {
        const obj = {
          username: 'john',
          password: 'secret123',
          confirmPassword: 'secret123',
          oldPassword: 'old123',
        };

        const result = sanitizeForLogging(obj);
        expect(result).toEqual({
          username: 'john',
          password: '[REDACTED]',
          confirmPassword: '[REDACTED]',
          oldPassword: '[REDACTED]',
        });
      });

      it('should redact token fields', () => {
        const obj = {
          name: 'test',
          accessToken: 'token123',
          refreshToken: 'refresh123',
          bearerToken: 'bearer123',
          authToken: 'auth123',
        };

        const result = sanitizeForLogging(obj);
        expect(result).toEqual({
          name: 'test',
          accessToken: '[REDACTED]',
          refreshToken: '[REDACTED]',
          bearerToken: '[REDACTED]',
          authToken: '[REDACTED]',
        });
      });

      it('should redact secret fields', () => {
        const obj = {
          name: 'test',
          secret: 'topsecret',
          clientSecret: 'client123',
          apiSecret: 'api123',
        };

        const result = sanitizeForLogging(obj);
        expect(result).toEqual({
          name: 'test',
          secret: '[REDACTED]',
          clientSecret: '[REDACTED]',
          apiSecret: '[REDACTED]',
        });
      });

      it('should redact key fields', () => {
        const obj = {
          name: 'test',
          key: 'key123',
          apiKey: 'api123',
          privateKey: 'private123',
          publicKey: 'public123',
        };

        const result = sanitizeForLogging(obj);
        expect(result).toEqual({
          name: 'test',
          key: '[REDACTED]',
          apiKey: '[REDACTED]',
          privateKey: '[REDACTED]',
          publicKey: '[REDACTED]',
        });
      });

      it('should redact authorization fields', () => {
        const obj = {
          name: 'test',
          authorization: 'Bearer token123',
          Authorization: 'Basic auth123',
        };

        const result = sanitizeForLogging(obj);
        expect(result).toEqual({
          name: 'test',
          authorization: '[REDACTED]',
          Authorization: '[REDACTED]',
        });
      });

      it('should redact cookie and session fields', () => {
        const obj = {
          name: 'test',
          cookie: 'session=abc123',
          cookies: ['session=abc123', 'auth=def456'],
          session: 'session123',
          sessionId: 'id123',
        };

        const result = sanitizeForLogging(obj);
        expect(result).toEqual({
          name: 'test',
          cookie: '[REDACTED]',
          cookies: '[REDACTED]',
          session: '[REDACTED]',
          sessionId: '[REDACTED]',
        });
      });

      it('should handle case-insensitive sensitive keys', () => {
        const obj = {
          PASSWORD: 'secret',
          Token: 'token123',
          SECRET: 'topsecret',
          Key: 'key123',
        };

        const result = sanitizeForLogging(obj);
        expect(result).toEqual({
          PASSWORD: '[REDACTED]',
          Token: '[REDACTED]',
          SECRET: '[REDACTED]',
          Key: '[REDACTED]',
        });
      });

      it('should handle partial matches in key names', () => {
        const obj = {
          userPassword: 'secret',
          accessTokenExpiry: 'token123',
          secretConfig: 'config',
          apiKeySettings: 'settings',
        };

        const result = sanitizeForLogging(obj);
        expect(result).toEqual({
          userPassword: '[REDACTED]',
          accessTokenExpiry: '[REDACTED]',
          secretConfig: '[REDACTED]',
          apiKeySettings: '[REDACTED]',
        });
      });

      it('should handle complex nested structures with sensitive data', () => {
        const obj = {
          user: {
            profile: {
              name: 'John',
              credentials: {
                password: 'secret123',
                credentials: {
                  accessToken: 'access123',
                  refreshToken: 'refresh123',
                },
              },
            },
          },
          config: {
            database: {
              host: 'localhost',
              password: 'dbpass123',
            },
            api: {
              keys: {
                primary: 'primary123',
                secondary: 'secondary123',
              },
            },
          },
        };

        const result = sanitizeForLogging(obj);
        expect(result.user.profile.name).toBe('John');
        expect(result.user.profile.credentials.password).toBe('[REDACTED]');

        expect(result.user.profile.credentials.credentials.accessToken).toBe(
          '[REDACTED]',
        );
        expect(result.user.profile.credentials.credentials.refreshToken).toBe(
          '[REDACTED]',
        );
        expect(result.config.database.host).toBe('localhost');
        expect(result.config.database.password).toBe('[REDACTED]');
        expect(result.config.api.keys).toBe('[REDACTED]'); // The entire 'keys' object is redacted
      });

      it('should handle arrays with mixed sensitive and non-sensitive data', () => {
        const arr = [
          'safe string',
          { name: 'John', password: 'secret' },
          123,
          { token: 'token123', data: 'safe data' },
        ];

        const result = sanitizeForLogging(arr);
        expect(result).toEqual([
          'safe string',
          { name: 'John', password: '[REDACTED]' },
          123,
          { token: '[REDACTED]', data: 'safe data' },
        ]);
      });
    });
  });
});
