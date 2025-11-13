/**
 * QuerySet class for building and executing queries
 */

import type {
  ModelClass,
  ModelInstance,
  Filter,
  TypedFilter,
  OrderingClause,
  RelationPath,
  BackendAdapter,
  QueryPlan,
  CompiledFilter,
  Lookup,
} from '../types';
import { DoesNotExist, MultipleObjectsReturned } from './errors';

/**
 * QuerySet - Lazy query builder
 * Queries are not executed until you iterate or call a terminal method
 */
export class QuerySet<T = unknown> {
  private model: ModelClass<T>;
  private adapter: BackendAdapter;
  private filters: Filter[] = [];
  private excludeFilters: Filter[] = [];
  private orderBy: OrderingClause[] = [];
  private limitValue?: number;
  private offsetValue?: number;
  private selectRelatedFields: RelationPath[] = [];
  private prefetchRelatedFields: RelationPath[] = [];
  private onlyFields?: string[];
  private deferFields?: string[];
  private _resultCache: T[] | null = null;

  constructor(model: ModelClass<T>, adapter: BackendAdapter) {
    this.model = model;
    this.adapter = adapter;
  }

  /**
   * Clone the queryset (for immutability)
   */
  private clone(): QuerySet<T> {
    const qs = new QuerySet<T>(this.model, this.adapter);
    qs.filters = [...this.filters];
    qs.excludeFilters = [...this.excludeFilters];
    qs.orderBy = [...this.orderBy];
    qs.limitValue = this.limitValue;
    qs.offsetValue = this.offsetValue;
    qs.selectRelatedFields = [...this.selectRelatedFields];
    qs.prefetchRelatedFields = [...this.prefetchRelatedFields];
    qs.onlyFields = this.onlyFields ? [...this.onlyFields] : undefined;
    qs.deferFields = this.deferFields ? [...this.deferFields] : undefined;
    return qs;
  }

  /**
   * Add filters to the queryset
   *
   * Provides autocomplete for field names and supports Django-style lookups.
   *
   * @example
   * ```typescript
   * // Direct field access (autocomplete works!)
   * Book.objects.filter({ title: 'Django' });
   *
   * // With lookups
   * Book.objects.filter({ pages__gte: 200 });
   *
   * // Multiple filters (AND logic)
   * Book.objects.filter({ published: true, pages__gt: 100 });
   * ```
   */
  filter(filters: TypedFilter<T>): QuerySet<T> {
    const qs = this.clone();
    qs.filters.push(filters as Filter);
    qs._resultCache = null;
    return qs;
  }

  /**
   * Add exclude filters to the queryset (NOT logic)
   *
   * @example
   * ```typescript
   * // Exclude published books
   * Book.objects.exclude({ published: true });
   *
   * // Exclude with lookups
   * Book.objects.exclude({ title__contains: 'draft' });
   * ```
   */
  exclude(filters: TypedFilter<T>): QuerySet<T> {
    const qs = this.clone();
    qs.excludeFilters.push(filters as Filter);
    qs._resultCache = null;
    return qs;
  }

  /**
   * Order the results
   */
  order_by(...fields: (keyof ModelInstance<T> | `-${string}`)[]): QuerySet<T> {
    const qs = this.clone();
    qs.orderBy = fields.map((field) => {
      const fieldStr = String(field);
      if (fieldStr.startsWith('-')) {
        return { field: fieldStr.slice(1), direction: 'desc' as const };
      }
      return { field: fieldStr, direction: 'asc' as const };
    });
    qs._resultCache = null;
    return qs;
  }

  /**
   * Limit the number of results
   */
  limit(count: number): QuerySet<T> {
    const qs = this.clone();
    qs.limitValue = count;
    qs._resultCache = null;
    return qs;
  }

  /**
   * Offset the results
   */
  offset(count: number): QuerySet<T> {
    const qs = this.clone();
    qs.offsetValue = count;
    qs._resultCache = null;
    return qs;
  }

  /**
   * Select related (eager load) - for ForeignKey relationships
   */
  select_related(...fields: RelationPath[]): QuerySet<T> {
    const qs = this.clone();
    qs.selectRelatedFields.push(...fields);
    qs._resultCache = null;
    return qs;
  }

  /**
   * Prefetch related - for reverse FK and M2M relationships
   */
  prefetch_related(...fields: RelationPath[]): QuerySet<T> {
    const qs = this.clone();
    qs.prefetchRelatedFields.push(...fields);
    qs._resultCache = null;
    return qs;
  }

  /**
   * Only fetch specific fields
   */
  only(...fields: (keyof ModelInstance<T>)[]): QuerySet<T> {
    const qs = this.clone();
    qs.onlyFields = fields.map(String);
    qs.deferFields = undefined; // Clear defer if set
    qs._resultCache = null;
    return qs;
  }

  /**
   * Defer specific fields (fetch all except these)
   */
  defer(...fields: (keyof ModelInstance<T>)[]): QuerySet<T> {
    const qs = this.clone();
    qs.deferFields = fields.map(String);
    qs.onlyFields = undefined; // Clear only if set
    qs._resultCache = null;
    return qs;
  }

  /**
   * Get distinct results
   */
  distinct(): QuerySet<T> {
    // TODO: Implement distinct
    return this.clone();
  }

  /**
   * Return values as plain objects instead of model instances
   */
  values(..._fields: (keyof ModelInstance<T>)[]): QuerySet<Record<string, unknown>> {
    // TODO: Implement values
    // For now, return a new QuerySet
    return new QuerySet<Record<string, unknown>>(
      this.model as unknown as ModelClass<Record<string, unknown>>,
      this.adapter
    );
  }

  /**
   * Return values as arrays (tuples)
   */
  values_list(..._fields: (keyof ModelInstance<T>)[]): QuerySet<unknown[]> {
    // TODO: Implement values_list
    return new QuerySet<unknown[]>(this.model as unknown as ModelClass<unknown[]>, this.adapter);
  }

  /**
   * Parse a filter key into field and lookup
   * Examples:
   *   'age' -> { field: 'age', lookup: 'exact' }
   *   'age__gte' -> { field: 'age', lookup: 'gte' }
   *   'name__contains' -> { field: 'name', lookup: 'contains' }
   */
  private parseFilterKey(key: string): { field: string; lookup: Lookup } {
    const parts = key.split('__');

    if (parts.length === 1) {
      // No lookup specified, default to 'exact'
      return { field: parts[0]!, lookup: 'exact' };
    }

    const possibleLookup = parts[parts.length - 1];
    const validLookups: Lookup[] = [
      'exact',
      'iexact',
      'contains',
      'icontains',
      'startswith',
      'istartswith',
      'endswith',
      'iendswith',
      'gt',
      'gte',
      'lt',
      'lte',
      'in',
      'range',
      'isnull',
      'year',
      'month',
      'day',
    ];

    if (validLookups.includes(possibleLookup as Lookup)) {
      // Last part is a lookup
      const field = parts.slice(0, -1).join('__');
      return { field, lookup: possibleLookup as Lookup };
    }

    // Not a recognized lookup, treat entire key as field name
    return { field: key, lookup: 'exact' };
  }

  /**
   * Compile a filter object into CompiledFilters
   */
  private compileFilter(filter: Filter): CompiledFilter[] {
    const compiled: CompiledFilter[] = [];

    for (const [key, value] of Object.entries(filter)) {
      const { field, lookup } = this.parseFilterKey(key);

      // Check if it's a relationship traversal (e.g., 'author__name')
      const path = field.includes('__') ? field.split('__') : undefined;

      compiled.push({
        field: path ? path[path.length - 1]! : field,
        lookup,
        value,
        path: path && path.length > 1 ? path.slice(0, -1) : undefined,
      });
    }

    return compiled;
  }

  /**
   * Build the query plan
   */
  private buildQueryPlan(): QueryPlan<T> {
    // Compile filters
    const compiledFilters: CompiledFilter[] = [];
    for (const filter of this.filters) {
      compiledFilters.push(...this.compileFilter(filter));
    }

    const compiledExcludes: CompiledFilter[] = [];
    for (const filter of this.excludeFilters) {
      compiledExcludes.push(...this.compileFilter(filter));
    }

    return {
      model: this.model,
      filters: compiledFilters,
      excludes: compiledExcludes,
      ordering: this.orderBy,
      limit: this.limitValue,
      offset: this.offsetValue,
      selectRelated: this.selectRelatedFields,
      prefetchRelated: this.prefetchRelatedFields,
      only: this.onlyFields,
      defer: this.deferFields,
    };
  }

  /**
   * Eager load related objects for select_related fields
   */
  private async eagerLoadRelations(results: T[]): Promise<void> {
    if (results.length === 0 || this.selectRelatedFields.length === 0) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modelClass = this.model as any;
    const fields = modelClass.getFields() as Map<string, unknown>;

    for (const relationPath of this.selectRelatedFields) {
      // For now, only support single-level relations (e.g., 'author')
      // TODO: Support nested relations (e.g., 'author__publisher')
      const fieldName = relationPath as string;
      const idFieldName = `${fieldName}_id`;

      // Get the ForeignKeyField from model metadata
      const field = fields.get(idFieldName);
      if (!field) {
        continue; // Field not found, skip
      }

      // Extract the related model from the field
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const relatedModel = (field as any).relatedModel;
      if (!relatedModel) {
        continue; // Not a ForeignKey field
      }

      // Collect all unique foreign key IDs from results
      const foreignKeyIds = new Set<number>();
      for (const result of results) {
        const fkId = (result as Record<string, unknown>)[idFieldName];
        if (fkId !== null && fkId !== undefined && typeof fkId === 'number') {
          foreignKeyIds.add(fkId);
        }
      }

      if (foreignKeyIds.size === 0) {
        continue; // No IDs to load
      }

      // Batch load all related instances using __in lookup
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const relatedInstances = await (relatedModel as any).objects.filter({ id__in: Array.from(foreignKeyIds) }).all();

      // Create a map of ID -> instance for quick lookup
      const instanceMap = new Map<number, unknown>();
      for (const instance of relatedInstances) {
        const id = (instance as Record<string, unknown>).id;
        if (id !== null && id !== undefined) {
          instanceMap.set(id as number, instance);
        }
      }

      // Populate the cache field in each result
      const cacheFieldName = `_${fieldName}`;
      for (const result of results) {
        const fkId = (result as Record<string, unknown>)[idFieldName];
        if (fkId !== null && fkId !== undefined && typeof fkId === 'number') {
          const relatedInstance = instanceMap.get(fkId);
          if (relatedInstance) {
            // Populate the cache so accessing the property doesn't trigger lazy load
            (result as Record<string, unknown>)[cacheFieldName] = relatedInstance;
          }
        }
      }
    }
  }

  /**
   * Execute the query and return results
   */
  private async execute(): Promise<T[]> {
    if (this._resultCache !== null) {
      return this._resultCache;
    }

    // Merge all filters into a single object
    const mergedFilters: Record<string, unknown> = {};
    for (const filter of this.filters) {
      Object.assign(mergedFilters, filter);
    }

    // Execute query through adapter
    const results = await this.adapter.find(this.model, mergedFilters);

    // Apply ordering (if adapter doesn't support it)
    if (this.orderBy.length > 0) {
      results.sort((a, b) => {
        for (const order of this.orderBy) {
          const aVal = (a as Record<string, unknown>)[order.field];
          const bVal = (b as Record<string, unknown>)[order.field];

          let comparison = 0;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((aVal as any) < (bVal as any)) comparison = -1;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          else if ((aVal as any) > (bVal as any)) comparison = 1;

          if (comparison !== 0) {
            return order.direction === 'desc' ? -comparison : comparison;
          }
        }
        return 0;
      });
    }

    // Apply limit/offset
    let finalResults = results;
    if (this.offsetValue !== undefined || this.limitValue !== undefined) {
      const start = this.offsetValue ?? 0;
      const end = this.limitValue !== undefined ? start + this.limitValue : undefined;
      finalResults = results.slice(start, end);
    }

    // Eager load related objects if select_related was used
    await this.eagerLoadRelations(finalResults);

    // Prefetch related objects if prefetch_related was used
    await this.prefetchRelations(finalResults);

    this._resultCache = finalResults;
    return finalResults;
  }

  /**
   * Prefetch related objects for prefetch_related fields (reverse FK, M2M)
   */
  private async prefetchRelations(results: T[]): Promise<void> {
    if (results.length === 0 || this.prefetchRelatedFields.length === 0) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modelClass = this.model as any;

    for (const relationPath of this.prefetchRelatedFields) {
      // For now, only support single-level relations (e.g., 'books')
      const fieldName = relationPath as string;

      // Collect all IDs from the main results
      const mainIds: number[] = [];
      for (const result of results) {
        const id = (result as Record<string, unknown>).id;
        if (id !== null && id !== undefined && typeof id === 'number') {
          mainIds.push(id);
        }
      }

      if (mainIds.length === 0) {
        continue;
      }

      // Try to find the reverse relation
      // This is tricky - we need to find which model has a FK pointing to us
      // For now, we'll rely on the fact that accessing the property will give us info

      // Get a sample property access to understand the relation type
      const sampleResult = results[0];
      if (!sampleResult) continue;

      try {
        // Access the property to get the QuerySet
        const relationAccessor = (sampleResult as Record<string, unknown>)[fieldName];

        // If it's a function (QuerySet getter), we can prefetch
        if (typeof relationAccessor === 'object' && relationAccessor !== null) {
          // It's a QuerySet, so it's a reverse FK
          // We need to find all related objects for all main IDs

          // The QuerySet should have a filter already applied
          // We'll load all related objects in one query
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const relatedQuerySet = relationAccessor as any;

          // Build filter for all IDs (e.g., author_id__in: [1, 2, 3])
          // We need to figure out the FK field name from the QuerySet filters
          // For now, assume it follows naming convention

          // Get all related objects for all main IDs at once
          const allRelated = await relatedQuerySet.all();

          // Group by foreign key
          const groupedByFK = new Map<number, unknown[]>();
          for (const relatedObj of allRelated) {
            const fkValue = (relatedObj as Record<string, unknown>)[`${modelClass.name.toLowerCase()}_id`];
            if (typeof fkValue === 'number') {
              if (!groupedByFK.has(fkValue)) {
                groupedByFK.set(fkValue, []);
              }
              groupedByFK.get(fkValue)!.push(relatedObj);
            }
          }

          // Populate cache for each result
          // Cache the QuerySet results so subsequent .all() calls don't hit DB
          for (const result of results) {
            const id = (result as Record<string, unknown>).id;
            if (typeof id === 'number') {
              const relatedObjects = groupedByFK.get(id) || [];
              // Store in a cache that the QuerySet can use
              // This is a simplified approach - ideally we'd cache in the QuerySet itself
              (result as Record<string, unknown>)[`_prefetched_${fieldName}`] = relatedObjects;
            }
          }
        }
      } catch (error) {
        // If we can't prefetch, just skip
        continue;
      }
    }
  }

  /**
   * Get all results
   */
  async all(): Promise<T[]> {
    return this.execute();
  }

  /**
   * Get a single object matching the filters
   * Throws DoesNotExist if not found
   * Throws MultipleObjectsReturned if more than one found
   */
  async get(filters?: TypedFilter<T>): Promise<T> {
    let qs: QuerySet<T> = this;
    if (filters) {
      qs = qs.filter(filters);
    }

    const results = await qs.execute();

    if (results.length === 0) {
      const allFilters = [...qs.filters, ...(filters ? [filters] : [])];
      throw new DoesNotExist(this.model.name, Object.assign({}, ...allFilters));
    }

    if (results.length > 1) {
      const allFilters = [...qs.filters, ...(filters ? [filters] : [])];
      throw new MultipleObjectsReturned(this.model.name, Object.assign({}, ...allFilters), results.length);
    }

    return results[0]!;
  }

  /**
   * Get the first result or undefined
   */
  async first(): Promise<T | undefined> {
    const results = await this.limit(1).execute();
    return results[0] as T | undefined;
  }

  /**
   * Get the last result or undefined
   */
  async last(): Promise<T | undefined> {
    const results = await this.execute();
    return results[results.length - 1];
  }

  /**
   * Check if any results exist
   */
  async exists(): Promise<boolean> {
    const results = await this.limit(1).execute();
    return results.length > 0;
  }

  /**
   * Count the results
   */
  async count(): Promise<number> {
    const results = await this.execute();
    return results.length;
  }

  /**
   * Create a new object
   */
  async create(data: Partial<ModelInstance<T>>): Promise<T> {
    const instance = new this.model(data) as T;
    await (instance as unknown as { save(): Promise<void> }).save();
    return instance;
  }

  /**
   * Update all matching objects
   */
  async update(data: Partial<ModelInstance<T>>): Promise<number> {
    const mergedFilters: Record<string, unknown> = {};
    for (const filter of this.filters) {
      Object.assign(mergedFilters, filter);
    }

    await this.adapter.update(this.model, mergedFilters, data as Record<string, unknown>);

    // Clear cache
    this._resultCache = null;

    // Return count of updated objects
    return this.count();
  }

  /**
   * Delete all matching objects
   */
  async delete(): Promise<number> {
    const count = await this.count();

    const mergedFilters: Record<string, unknown> = {};
    for (const filter of this.filters) {
      Object.assign(mergedFilters, filter);
    }

    await this.adapter.delete(this.model, mergedFilters);

    // Clear cache
    this._resultCache = null;

    return count;
  }

  /**
   * Iterate over results
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    const results = await this.execute();
    for (const result of results) {
      yield result;
    }
  }

  /**
   * Convert to array (terminal operation)
   */
  async toArray(): Promise<T[]> {
    return this.execute();
  }

  /**
   * Get query plan (for debugging/optimization)
   */
  getQueryPlan(): QueryPlan<T> {
    return this.buildQueryPlan();
  }
}
