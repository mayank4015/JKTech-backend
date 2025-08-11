import {
  QueryBuilder,
  PaginationOptions,
  PaginationResult,
  FilterOptions,
} from './query-builder.util';

describe('QueryBuilder Utility', () => {
  describe('buildPaginationQuery', () => {
    describe('Positive Cases', () => {
      it('should build pagination query with default values', () => {
        const result = QueryBuilder.buildPaginationQuery();

        expect(result).toEqual({
          skip: 0,
          take: 10,
          orderBy: { createdAt: 'desc' },
          pagination: {
            page: 1,
            limit: 10,
          },
        });
      });

      it('should build pagination query with custom page and limit', () => {
        const options: PaginationOptions = {
          page: 3,
          limit: 20,
        };

        const result = QueryBuilder.buildPaginationQuery(options);

        expect(result).toEqual({
          skip: 40, // (3 - 1) * 20
          take: 20,
          orderBy: { createdAt: 'desc' },
          pagination: {
            page: 3,
            limit: 20,
          },
        });
      });

      it('should build pagination query with custom sorting', () => {
        const options: PaginationOptions = {
          page: 1,
          limit: 10,
          sortBy: 'name',
          sortOrder: 'asc',
        };

        const result = QueryBuilder.buildPaginationQuery(options);

        expect(result).toEqual({
          skip: 0,
          take: 10,
          orderBy: { name: 'asc' },
          pagination: {
            page: 1,
            limit: 10,
          },
        });
      });

      it('should use default sort order when only sortBy is provided', () => {
        const options: PaginationOptions = {
          sortBy: 'title',
        };

        const result = QueryBuilder.buildPaginationQuery(options);

        expect(result.orderBy).toEqual({ title: 'desc' });
      });

      it('should handle large page numbers', () => {
        const options: PaginationOptions = {
          page: 1000,
          limit: 50,
        };

        const result = QueryBuilder.buildPaginationQuery(options);

        expect(result.skip).toBe(49950); // (1000 - 1) * 50
        expect(result.take).toBe(50);
      });
    });

    describe('Negative Cases', () => {
      it('should enforce minimum page number of 1', () => {
        const options: PaginationOptions = {
          page: 0,
          limit: 10,
        };

        const result = QueryBuilder.buildPaginationQuery(options);

        expect(result.pagination.page).toBe(1);
        expect(result.skip).toBe(0);
      });

      it('should enforce minimum page number for negative values', () => {
        const options: PaginationOptions = {
          page: -5,
          limit: 10,
        };

        const result = QueryBuilder.buildPaginationQuery(options);

        expect(result.pagination.page).toBe(1);
        expect(result.skip).toBe(0);
      });

      it('should enforce minimum limit of 1', () => {
        const options: PaginationOptions = {
          page: 1,
          limit: 0,
        };

        const result = QueryBuilder.buildPaginationQuery(options);

        expect(result.pagination.limit).toBe(1);
        expect(result.take).toBe(1);
      });

      it('should enforce minimum limit for negative values', () => {
        const options: PaginationOptions = {
          page: 1,
          limit: -10,
        };

        const result = QueryBuilder.buildPaginationQuery(options);

        expect(result.pagination.limit).toBe(1);
        expect(result.take).toBe(1);
      });

      it('should enforce maximum limit of 100', () => {
        const options: PaginationOptions = {
          page: 1,
          limit: 500,
        };

        const result = QueryBuilder.buildPaginationQuery(options);

        expect(result.pagination.limit).toBe(100);
        expect(result.take).toBe(100);
      });

      it('should handle fractional page numbers', () => {
        const options: PaginationOptions = {
          page: 2.7,
          limit: 10,
        };

        const result = QueryBuilder.buildPaginationQuery(options);

        expect(result.pagination.page).toBe(2.7); // No rounding applied
        expect(result.skip).toBe(17); // (2.7 - 1) * 10
      });

      it('should handle fractional limit values', () => {
        const options: PaginationOptions = {
          page: 1,
          limit: 15.8,
        };

        const result = QueryBuilder.buildPaginationQuery(options);

        expect(result.pagination.limit).toBe(15.8); // No rounding applied
        expect(result.take).toBe(15.8);
      });
    });
  });

  describe('buildPaginationResult', () => {
    describe('Positive Cases', () => {
      it('should build pagination result with data', () => {
        const data = [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' },
        ];

        const result = QueryBuilder.buildPaginationResult(data, 50, 1, 10);

        expect(result).toEqual({
          data,
          pagination: {
            page: 1,
            limit: 10,
            total: 50,
            totalPages: 5,
            hasNext: true,
            hasPrev: false,
          },
        });
      });

      it('should calculate pagination for middle page', () => {
        const data = [{ id: 1, name: 'Item 1' }];

        const result = QueryBuilder.buildPaginationResult(data, 100, 5, 10);

        expect(result.pagination).toEqual({
          page: 5,
          limit: 10,
          total: 100,
          totalPages: 10,
          hasNext: true,
          hasPrev: true,
        });
      });

      it('should calculate pagination for last page', () => {
        const data = [{ id: 1, name: 'Item 1' }];

        const result = QueryBuilder.buildPaginationResult(data, 25, 3, 10);

        expect(result.pagination).toEqual({
          page: 3,
          limit: 10,
          total: 25,
          totalPages: 3,
          hasNext: false,
          hasPrev: true,
        });
      });

      it('should handle single page results', () => {
        const data = [{ id: 1, name: 'Item 1' }];

        const result = QueryBuilder.buildPaginationResult(data, 5, 1, 10);

        expect(result.pagination).toEqual({
          page: 1,
          limit: 10,
          total: 5,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        });
      });

      it('should handle empty data', () => {
        const result = QueryBuilder.buildPaginationResult([], 0, 1, 10);

        expect(result).toEqual({
          data: [],
          pagination: {
            page: 1,
            limit: 10,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false,
          },
        });
      });

      it('should handle exact page division', () => {
        const data = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));

        const result = QueryBuilder.buildPaginationResult(data, 100, 5, 10);

        expect(result.pagination.totalPages).toBe(10);
        expect(result.pagination.hasNext).toBe(true);
        expect(result.pagination.hasPrev).toBe(true);
      });
    });

    describe('Negative Cases', () => {
      it('should handle zero total count', () => {
        const result = QueryBuilder.buildPaginationResult([], 0, 1, 10);

        expect(result.pagination.totalPages).toBe(0);
        expect(result.pagination.hasNext).toBe(false);
        expect(result.pagination.hasPrev).toBe(false);
      });

      it('should handle page beyond total pages', () => {
        const data = [];

        const result = QueryBuilder.buildPaginationResult(data, 10, 5, 10);

        expect(result.pagination).toEqual({
          page: 5,
          limit: 10,
          total: 10,
          totalPages: 1,
          hasNext: false,
          hasPrev: true,
        });
      });

      it('should handle fractional total pages', () => {
        const data = [{ id: 1 }];

        const result = QueryBuilder.buildPaginationResult(data, 23, 1, 10);

        expect(result.pagination.totalPages).toBe(3); // Math.ceil(23/10)
      });

      it('should handle large numbers', () => {
        const data = Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }));

        const result = QueryBuilder.buildPaginationResult(
          data,
          1000000,
          5000,
          100,
        );

        expect(result.pagination.totalPages).toBe(10000);
        expect(result.pagination.hasNext).toBe(true);
        expect(result.pagination.hasPrev).toBe(true);
      });
    });
  });

  describe('buildWhereClause', () => {
    describe('Positive Cases', () => {
      it('should build where clause for simple filters', () => {
        const filters: FilterOptions = {
          name: 'John',
          age: 25,
          active: true,
        };

        const result = QueryBuilder.buildWhereClause(filters);

        expect(result).toEqual({
          name: 'John',
          age: 25,
          active: true,
        });
      });

      it('should handle contains filters', () => {
        const filters: FilterOptions = {
          name_contains: 'john',
          description_contains: 'test',
        };

        const result = QueryBuilder.buildWhereClause(filters);

        expect(result).toEqual({
          name: {
            contains: 'john',
            mode: 'insensitive',
          },
          description: {
            contains: 'test',
            mode: 'insensitive',
          },
        });
      });

      it('should handle starts_with filters', () => {
        const filters: FilterOptions = {
          title_starts_with: 'Project',
        };

        const result = QueryBuilder.buildWhereClause(filters);

        expect(result).toEqual({
          title: {
            startsWith: 'Project',
            mode: 'insensitive',
          },
        });
      });

      it('should handle ends_with filters', () => {
        const filters: FilterOptions = {
          fileName_ends_with: '.pdf',
        };

        const result = QueryBuilder.buildWhereClause(filters);

        expect(result).toEqual({
          fileName: {
            endsWith: '.pdf',
            mode: 'insensitive',
          },
        });
      });

      it('should handle array filters (in clause)', () => {
        const filters: FilterOptions = {
          status: ['active', 'pending', 'completed'],
          category: ['work', 'personal'],
        };

        const result = QueryBuilder.buildWhereClause(filters);

        expect(result).toEqual({
          status: {
            in: ['active', 'pending', 'completed'],
          },
          category: {
            in: ['work', 'personal'],
          },
        });
      });

      it('should handle range filters', () => {
        const filters: FilterOptions = {
          age: { gte: 18, lte: 65 },
          price: { gt: 100, lt: 1000 },
        };

        const result = QueryBuilder.buildWhereClause(filters);

        expect(result).toEqual({
          age: { gte: 18, lte: 65 },
          price: { gt: 100, lt: 1000 },
        });
      });

      it('should handle mixed filter types', () => {
        const filters: FilterOptions = {
          name: 'John',
          email_contains: 'example',
          age: { gte: 18 },
          status: ['active', 'pending'],
          verified: true,
        };

        const result = QueryBuilder.buildWhereClause(filters);

        expect(result).toEqual({
          name: 'John',
          email: {
            contains: 'example',
            mode: 'insensitive',
          },
          age: { gte: 18 },
          status: {
            in: ['active', 'pending'],
          },
          verified: true,
        });
      });

      it('should handle empty filters', () => {
        const result = QueryBuilder.buildWhereClause({});
        expect(result).toEqual({});
      });

      it('should handle no filters parameter', () => {
        const result = QueryBuilder.buildWhereClause();
        expect(result).toEqual({});
      });
    });

    describe('Negative Cases', () => {
      it('should ignore null and undefined values', () => {
        const filters: FilterOptions = {
          name: 'John',
          age: null,
          email: undefined,
          active: true,
        };

        const result = QueryBuilder.buildWhereClause(filters);

        expect(result).toEqual({
          name: 'John',
          active: true,
        });
      });

      it('should handle empty arrays', () => {
        const filters: FilterOptions = {
          status: [],
          tags: [],
          name: 'John',
        };

        const result = QueryBuilder.buildWhereClause(filters);

        expect(result).toEqual({
          status: { in: [] },
          tags: { in: [] },
          name: 'John',
        });
      });

      it('should handle empty strings', () => {
        const filters: FilterOptions = {
          name: '',
          description_contains: '',
        };

        const result = QueryBuilder.buildWhereClause(filters);

        expect(result).toEqual({
          name: '',
          description: {
            contains: '',
            mode: 'insensitive',
          },
        });
      });

      it('should handle zero values', () => {
        const filters: FilterOptions = {
          count: 0,
          price: 0,
          active: false,
        };

        const result = QueryBuilder.buildWhereClause(filters);

        expect(result).toEqual({
          count: 0,
          price: 0,
          active: false,
        });
      });

      it('should handle complex nested objects', () => {
        const filters: FilterOptions = {
          metadata: {
            nested: {
              value: 'test',
            },
          },
        };

        const result = QueryBuilder.buildWhereClause(filters);

        expect(result).toEqual({
          metadata: {
            nested: {
              value: 'test',
            },
          },
        });
      });
    });
  });

  describe('buildSearchQuery', () => {
    describe('Positive Cases', () => {
      it('should build search query for multiple fields', () => {
        const searchTerm = 'test query';
        const searchFields = ['title', 'description', 'content'];

        const result = QueryBuilder.buildSearchQuery(searchTerm, searchFields);

        expect(result).toEqual({
          OR: [
            {
              title: {
                contains: 'test query',
                mode: 'insensitive',
              },
            },
            {
              description: {
                contains: 'test query',
                mode: 'insensitive',
              },
            },
            {
              content: {
                contains: 'test query',
                mode: 'insensitive',
              },
            },
          ],
        });
      });

      it('should build search query for single field', () => {
        const searchTerm = 'john';
        const searchFields = ['name'];

        const result = QueryBuilder.buildSearchQuery(searchTerm, searchFields);

        expect(result).toEqual({
          OR: [
            {
              name: {
                contains: 'john',
                mode: 'insensitive',
              },
            },
          ],
        });
      });

      it('should handle special characters in search term', () => {
        const searchTerm = 'test@example.com';
        const searchFields = ['email'];

        const result = QueryBuilder.buildSearchQuery(searchTerm, searchFields);

        expect(result).toEqual({
          OR: [
            {
              email: {
                contains: 'test@example.com',
                mode: 'insensitive',
              },
            },
          ],
        });
      });
    });

    describe('Negative Cases', () => {
      it('should return empty object for empty search term', () => {
        const result = QueryBuilder.buildSearchQuery('', [
          'title',
          'description',
        ]);
        expect(result).toEqual({});
      });

      it('should return empty object for empty search fields', () => {
        const result = QueryBuilder.buildSearchQuery('test', []);
        expect(result).toEqual({});
      });

      it('should return empty object for both empty', () => {
        const result = QueryBuilder.buildSearchQuery('', []);
        expect(result).toEqual({});
      });

      it('should return empty object for whitespace-only search term', () => {
        const result = QueryBuilder.buildSearchQuery('   ', ['title']);
        expect(result).toEqual({});
      });

      it('should return empty object for null search term', () => {
        const result = QueryBuilder.buildSearchQuery(
          null as unknown as string,
          ['title'],
        );
        expect(result).toEqual({});
      });

      it('should return empty object for undefined search term', () => {
        const result = QueryBuilder.buildSearchQuery(
          undefined as unknown as string,
          ['title'],
        );
        expect(result).toEqual({});
      });
    });
  });

  describe('combineWhereConditions', () => {
    describe('Positive Cases', () => {
      it('should combine multiple conditions with AND', () => {
        const condition1 = { name: 'John' };
        const condition2 = { age: { gte: 18 } };
        const condition3 = { active: true };

        const result = QueryBuilder.combineWhereConditions(
          condition1,
          condition2,
          condition3,
        );

        expect(result).toEqual({
          AND: [{ name: 'John' }, { age: { gte: 18 } }, { active: true }],
        });
      });

      it('should return single condition when only one valid condition', () => {
        const condition = { name: 'John' };

        const result = QueryBuilder.combineWhereConditions(condition);

        expect(result).toEqual({ name: 'John' });
      });

      it('should handle complex nested conditions', () => {
        const condition1 = {
          OR: [{ name: 'John' }, { name: 'Jane' }],
        };
        const condition2 = { age: { gte: 18 } };

        const result = QueryBuilder.combineWhereConditions(
          condition1,
          condition2,
        );

        expect(result).toEqual({
          AND: [
            {
              OR: [{ name: 'John' }, { name: 'Jane' }],
            },
            { age: { gte: 18 } },
          ],
        });
      });
    });

    describe('Negative Cases', () => {
      it('should return empty object when no conditions provided', () => {
        const result = QueryBuilder.combineWhereConditions();
        expect(result).toEqual({});
      });

      it('should ignore null conditions', () => {
        const condition1 = { name: 'John' };
        const condition2 = null;
        const condition3 = { age: 25 };

        const result = QueryBuilder.combineWhereConditions(
          condition1,
          condition2,
          condition3,
        );

        expect(result).toEqual({
          AND: [{ name: 'John' }, { age: 25 }],
        });
      });

      it('should ignore undefined conditions', () => {
        const condition1 = { name: 'John' };
        const condition2 = undefined;

        const result = QueryBuilder.combineWhereConditions(
          condition1,
          condition2,
        );

        expect(result).toEqual({ name: 'John' });
      });

      it('should ignore empty object conditions', () => {
        const condition1 = { name: 'John' };
        const condition2 = {};
        const condition3 = { age: 25 };

        const result = QueryBuilder.combineWhereConditions(
          condition1,
          condition2,
          condition3,
        );

        expect(result).toEqual({
          AND: [{ name: 'John' }, { age: 25 }],
        });
      });

      it('should return empty object when all conditions are invalid', () => {
        const result = QueryBuilder.combineWhereConditions(null, undefined, {});
        expect(result).toEqual({});
      });
    });
  });

  describe('buildDateRangeFilter', () => {
    describe('Positive Cases', () => {
      it('should build date range filter with both start and end dates', () => {
        const startDate = '2024-01-01';
        const endDate = '2024-12-31';

        const result = QueryBuilder.buildDateRangeFilter(startDate, endDate);

        expect(result).toEqual({
          gte: new Date('2024-01-01'),
          lte: new Date('2024-12-31'),
        });
      });

      it('should build date range filter with only start date', () => {
        const startDate = '2024-01-01';

        const result = QueryBuilder.buildDateRangeFilter(startDate);

        expect(result).toEqual({
          gte: new Date('2024-01-01'),
        });
      });

      it('should build date range filter with only end date', () => {
        const endDate = '2024-12-31';

        const result = QueryBuilder.buildDateRangeFilter(undefined, endDate);

        expect(result).toEqual({
          lte: new Date('2024-12-31'),
        });
      });

      it('should handle Date objects as input', () => {
        const startDate = new Date('2024-01-01');
        const endDate = new Date('2024-12-31');

        const result = QueryBuilder.buildDateRangeFilter(startDate, endDate);

        expect(result).toEqual({
          gte: new Date('2024-01-01'),
          lte: new Date('2024-12-31'),
        });
      });

      it('should handle ISO date strings', () => {
        const startDate = '2024-01-01T00:00:00.000Z';
        const endDate = '2024-12-31T23:59:59.999Z';

        const result = QueryBuilder.buildDateRangeFilter(startDate, endDate);

        expect(result).toEqual({
          gte: new Date('2024-01-01T00:00:00.000Z'),
          lte: new Date('2024-12-31T23:59:59.999Z'),
        });
      });
    });

    describe('Negative Cases', () => {
      it('should return undefined when no dates provided', () => {
        const result = QueryBuilder.buildDateRangeFilter();
        expect(result).toBeUndefined();
      });

      it('should return undefined when both dates are null', () => {
        const result = QueryBuilder.buildDateRangeFilter(
          null as unknown as string,
          null as unknown as string,
        );
        expect(result).toBeUndefined();
      });

      it('should return undefined when both dates are undefined', () => {
        const result = QueryBuilder.buildDateRangeFilter(undefined, undefined);
        expect(result).toBeUndefined();
      });

      it('should handle invalid date strings gracefully', () => {
        const startDate = 'invalid-date';
        const endDate = '2024-12-31';

        const result = QueryBuilder.buildDateRangeFilter(startDate, endDate);

        expect(result.gte).toBeUndefined(); // Invalid date should be ignored
        expect(result.lte).toEqual(new Date('2024-12-31'));
      });

      it('should handle empty string dates', () => {
        const result = QueryBuilder.buildDateRangeFilter('', '');
        expect(result).toBeUndefined();
      });
    });
  });

  describe('buildSelectFields', () => {
    describe('Positive Cases', () => {
      it('should build select object from field array', () => {
        const fields = ['id', 'name', 'email', 'createdAt'];

        const result = QueryBuilder.buildSelectFields(fields);

        expect(result).toEqual({
          id: true,
          name: true,
          email: true,
          createdAt: true,
        });
      });

      it('should handle single field', () => {
        const fields = ['id'];

        const result = QueryBuilder.buildSelectFields(fields);

        expect(result).toEqual({
          id: true,
        });
      });

      it('should handle nested field names', () => {
        const fields = ['user.profile.name', 'user.email'];

        const result = QueryBuilder.buildSelectFields(fields);

        expect(result).toEqual({
          'user.profile.name': true,
          'user.email': true,
        });
      });
    });

    describe('Negative Cases', () => {
      it('should return undefined for empty array', () => {
        const result = QueryBuilder.buildSelectFields([]);
        expect(result).toBeUndefined();
      });

      it('should return undefined for null input', () => {
        const result = QueryBuilder.buildSelectFields(
          null as unknown as string[],
        );
        expect(result).toBeUndefined();
      });

      it('should return undefined for undefined input', () => {
        const result = QueryBuilder.buildSelectFields(undefined);
        expect(result).toBeUndefined();
      });

      it('should handle array with empty strings', () => {
        const fields = ['id', '', 'name'];

        const result = QueryBuilder.buildSelectFields(fields);

        expect(result).toEqual({
          id: true,
          '': true,
          name: true,
        });
      });
    });
  });

  describe('buildIncludeRelations', () => {
    describe('Positive Cases', () => {
      it('should build include object from relations array', () => {
        const relations = ['user', 'comments', 'tags'];

        const result = QueryBuilder.buildIncludeRelations(relations);

        expect(result).toEqual({
          user: true,
          comments: true,
          tags: true,
        });
      });

      it('should handle single relation', () => {
        const relations = ['user'];

        const result = QueryBuilder.buildIncludeRelations(relations);

        expect(result).toEqual({
          user: true,
        });
      });

      it('should handle nested relation names', () => {
        const relations = ['user.profile', 'comments.author'];

        const result = QueryBuilder.buildIncludeRelations(relations);

        expect(result).toEqual({
          'user.profile': true,
          'comments.author': true,
        });
      });
    });

    describe('Negative Cases', () => {
      it('should return undefined for empty array', () => {
        const result = QueryBuilder.buildIncludeRelations([]);
        expect(result).toBeUndefined();
      });

      it('should return undefined for null input', () => {
        const result = QueryBuilder.buildIncludeRelations(
          null as unknown as string[],
        );
        expect(result).toBeUndefined();
      });

      it('should return undefined for undefined input', () => {
        const result = QueryBuilder.buildIncludeRelations(undefined);
        expect(result).toBeUndefined();
      });

      it('should handle array with empty strings', () => {
        const relations = ['user', '', 'comments'];

        const result = QueryBuilder.buildIncludeRelations(relations);

        expect(result).toEqual({
          user: true,
          '': true,
          comments: true,
        });
      });
    });
  });
});
