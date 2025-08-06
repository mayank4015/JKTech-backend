export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface FilterOptions {
  [key: string]: any;
}

export class QueryBuilder {
  static buildPaginationQuery(options: PaginationOptions = {}) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 10));
    const skip = (page - 1) * limit;

    const orderBy = options.sortBy
      ? {
          [options.sortBy]: options.sortOrder || 'desc',
        }
      : { createdAt: 'desc' };

    return {
      skip,
      take: limit,
      orderBy,
      pagination: {
        page,
        limit,
      },
    };
  }

  static buildPaginationResult<T>(
    data: T[],
    total: number,
    page: number,
    limit: number,
  ): PaginationResult<T> {
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext,
        hasPrev,
      },
    };
  }

  static buildWhereClause(filters: FilterOptions = {}): any {
    const where: any = {};

    Object.entries(filters).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }

      // Handle different filter types
      if (typeof value === 'string') {
        if (key.endsWith('_contains')) {
          const field = key.replace('_contains', '');
          where[field] = {
            contains: value,
            mode: 'insensitive',
          };
        } else if (key.endsWith('_starts_with')) {
          const field = key.replace('_starts_with', '');
          where[field] = {
            startsWith: value,
            mode: 'insensitive',
          };
        } else if (key.endsWith('_ends_with')) {
          const field = key.replace('_ends_with', '');
          where[field] = {
            endsWith: value,
            mode: 'insensitive',
          };
        } else {
          where[key] = value;
        }
      } else if (typeof value === 'boolean') {
        where[key] = value;
      } else if (typeof value === 'number') {
        where[key] = value;
      } else if (Array.isArray(value)) {
        where[key] = {
          in: value,
        };
      } else if (typeof value === 'object') {
        // Handle date ranges, number ranges, etc.
        if (value.gte !== undefined || value.lte !== undefined) {
          where[key] = value;
        } else if (value.gt !== undefined || value.lt !== undefined) {
          where[key] = value;
        } else {
          where[key] = value;
        }
      }
    });

    return where;
  }

  static buildSearchQuery(searchTerm: string, searchFields: string[]): any {
    if (!searchTerm || !searchFields.length) {
      return {};
    }

    return {
      OR: searchFields.map((field) => ({
        [field]: {
          contains: searchTerm,
          mode: 'insensitive',
        },
      })),
    };
  }

  static combineWhereConditions(...conditions: any[]): any {
    const validConditions = conditions.filter(
      (condition) => condition && Object.keys(condition).length > 0,
    );

    if (validConditions.length === 0) {
      return {};
    }

    if (validConditions.length === 1) {
      return validConditions[0];
    }

    return {
      AND: validConditions,
    };
  }

  static buildDateRangeFilter(
    startDate?: string | Date,
    endDate?: string | Date,
  ): any {
    const filter: any = {};

    if (startDate) {
      filter.gte = new Date(startDate);
    }

    if (endDate) {
      filter.lte = new Date(endDate);
    }

    return Object.keys(filter).length > 0 ? filter : undefined;
  }

  static buildSelectFields(fields?: string[]): any {
    if (!fields || fields.length === 0) {
      return undefined;
    }

    const select: any = {};
    fields.forEach((field) => {
      select[field] = true;
    });

    return select;
  }

  static buildIncludeRelations(relations?: string[]): any {
    if (!relations || relations.length === 0) {
      return undefined;
    }

    const include: any = {};
    relations.forEach((relation) => {
      include[relation] = true;
    });

    return include;
  }
}
