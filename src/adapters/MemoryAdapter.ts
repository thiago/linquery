/**
 * In-memory adapter for testing and development
 */

import type { BackendAdapter, ModelClass, QueryPlan, Lookup } from '../types';

/**
 * Simple in-memory storage adapter
 * Stores data in memory using Map
 */
export class MemoryAdapter implements BackendAdapter {
  private storage = new Map<string, Map<string | number, Record<string, unknown>>>();
  private autoIncrementCounters = new Map<string, number>();

  /**
   * Connect (no-op for memory adapter)
   */
  async connect(): Promise<void> {
    // No connection needed for memory adapter
  }

  /**
   * Disconnect (no-op for memory adapter)
   */
  async disconnect(): Promise<void> {
    // Clear storage on disconnect
    this.storage.clear();
    this.autoIncrementCounters.clear();
  }

  /**
   * Get the table name for a model
   */
  private getTableName<T>(model: ModelClass<T>): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (model as any).getTableName?.() ?? model.name.toLowerCase();
  }

  /**
   * Get the primary key field name for a model
   */
  private getPrimaryKey<T>(model: ModelClass<T>): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (model as any).getPrimaryKey?.() ?? 'id';
  }

  /**
   * Get or create table storage
   */
  private getTable(tableName: string): Map<string | number, Record<string, unknown>> {
    if (!this.storage.has(tableName)) {
      this.storage.set(tableName, new Map());
    }
    return this.storage.get(tableName)!;
  }

  /**
   * Generate next auto-increment ID
   */
  private getNextId(tableName: string): number {
    const current = this.autoIncrementCounters.get(tableName) ?? 0;
    const next = current + 1;
    this.autoIncrementCounters.set(tableName, next);
    return next;
  }

  /**
   * Create a new record
   */
  async create<T>(model: ModelClass<T>, data: Record<string, unknown>): Promise<T> {
    const tableName = this.getTableName(model);
    const pkField = this.getPrimaryKey(model);
    const table = this.getTable(tableName);

    // Generate ID if not provided
    if (!data[pkField]) {
      data[pkField] = this.getNextId(tableName);
    }

    const id = data[pkField] as string | number;

    // Check for unique constraint violation
    if (table.has(id)) {
      throw new Error(`Record with ${pkField}=${id} already exists`);
    }

    // Store the data
    const record = { ...data };
    table.set(id, record);

    // Return the record as T (will be assigned to the instance)
    return record as T;
  }

  /**
   * Find records matching filters
   */
  async find<T>(model: ModelClass<T>, filters: Record<string, unknown>): Promise<T[]> {
    const tableName = this.getTableName(model);
    const table = this.getTable(tableName);

    const results: T[] = [];

    for (const record of table.values()) {
      if (this.matchesFilters(model, record, filters)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const instance = (model as any).fromDB?.(record) ?? (new model(record) as T);
        results.push(instance);
      }
    }

    return results;
  }

  /**
   * Parse a filter key into field and lookup
   */
  private parseFilterKey(key: string): { field: string; lookup: Lookup } {
    const parts = key.split('__');

    if (parts.length === 1) {
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
      const field = parts.slice(0, -1).join('__');
      return { field, lookup: possibleLookup as Lookup };
    }

    return { field: key, lookup: 'exact' };
  }

  /**
   * Check if a value matches a lookup condition
   */
  private matchesLookup(fieldValue: unknown, lookup: Lookup, filterValue: unknown): boolean {
    // Handle null checks
    if (lookup === 'isnull') {
      const isNull = fieldValue === null || fieldValue === undefined;
      return filterValue === true ? isNull : !isNull;
    }

    // If field is null/undefined and lookup isn't isnull, no match
    if (fieldValue === null || fieldValue === undefined) {
      return false;
    }

    switch (lookup) {
      case 'exact':
        return fieldValue === filterValue;

      case 'iexact':
        return String(fieldValue).toLowerCase() === String(filterValue).toLowerCase();

      case 'contains':
        return String(fieldValue).includes(String(filterValue));

      case 'icontains':
        return String(fieldValue).toLowerCase().includes(String(filterValue).toLowerCase());

      case 'startswith':
        return String(fieldValue).startsWith(String(filterValue));

      case 'istartswith':
        return String(fieldValue).toLowerCase().startsWith(String(filterValue).toLowerCase());

      case 'endswith':
        return String(fieldValue).endsWith(String(filterValue));

      case 'iendswith':
        return String(fieldValue).toLowerCase().endsWith(String(filterValue).toLowerCase());

      case 'gt':
        return (fieldValue as number) > (filterValue as number);

      case 'gte':
        return (fieldValue as number) >= (filterValue as number);

      case 'lt':
        return (fieldValue as number) < (filterValue as number);

      case 'lte':
        return (fieldValue as number) <= (filterValue as number);

      case 'in':
        return Array.isArray(filterValue) && filterValue.includes(fieldValue);

      case 'range':
        if (Array.isArray(filterValue) && filterValue.length === 2) {
          const [min, max] = filterValue;
          return (fieldValue as number) >= (min as number) && (fieldValue as number) <= (max as number);
        }
        return false;

      case 'year':
        if (fieldValue instanceof Date) {
          return fieldValue.getUTCFullYear() === filterValue;
        }
        return false;

      case 'month':
        if (fieldValue instanceof Date) {
          return fieldValue.getUTCMonth() + 1 === filterValue;
        }
        return false;

      case 'day':
        if (fieldValue instanceof Date) {
          return fieldValue.getUTCDate() === filterValue;
        }
        return false;

      default:
        return false;
    }
  }

  /**
   * Check if a record matches the filters
   */
  private matchesFilters<T>(
    model: ModelClass<T>,
    record: Record<string, unknown>,
    filters: Record<string, unknown>
  ): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fields = (model as any).getFields?.() as Map<string, any> | undefined;

    for (const [key, value] of Object.entries(filters)) {
      const { field, lookup } = this.parseFilterKey(key);
      let fieldValue = record[field];

      // Deserialize the field value if we have field metadata
      if (fields) {
        const fieldDef = fields.get(field);
        if (fieldDef && fieldDef.fromDB) {
          fieldValue = fieldDef.fromDB(fieldValue);
        }
      }

      if (!this.matchesLookup(fieldValue, lookup, value)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Update records matching filters
   */
  async update<T>(
    model: ModelClass<T>,
    filters: Record<string, unknown>,
    data: Record<string, unknown>
  ): Promise<void> {
    const tableName = this.getTableName(model);
    const pkField = this.getPrimaryKey(model);
    const table = this.getTable(tableName);

    for (const [id, record] of table.entries()) {
      if (this.matchesFilters(model, record, filters)) {
        // Update the record (but don't allow changing the primary key)
        const updated = { ...record, ...data };
        if (data[pkField] !== undefined && data[pkField] !== id) {
          throw new Error(`Cannot change primary key ${pkField}`);
        }
        updated[pkField] = id; // Preserve the original ID
        table.set(id, updated);
      }
    }
  }

  /**
   * Delete records matching filters
   */
  async delete<T>(model: ModelClass<T>, filters: Record<string, unknown>): Promise<void> {
    const tableName = this.getTableName(model);
    const table = this.getTable(tableName);

    const toDelete: (string | number)[] = [];

    for (const [id, record] of table.entries()) {
      if (this.matchesFilters(model, record, filters)) {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      table.delete(id);
    }
  }

  /**
   * Get a single record by ID
   */
  async get<T>(model: ModelClass<T>, id: unknown): Promise<T | null> {
    const tableName = this.getTableName(model);
    const table = this.getTable(tableName);
    const record = table.get(id as string | number);

    if (!record) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (model as any).fromDB?.(record) ?? (new model(record) as T);
  }

  /**
   * List records with advanced query plan
   */
  async list<T>(model: ModelClass<T>, plan: QueryPlan): Promise<T[]> {
    const tableName = this.getTableName(model);
    const table = this.getTable(tableName);
    let results: T[] = [];

    // Apply filters
    for (const record of table.values()) {
      let matches = true;

      // Check all filters
      for (const filter of plan.filters || []) {
        if (!this.matchesLookup(record[filter.field], filter.lookup, filter.value)) {
          matches = false;
          break;
        }
      }

      if (matches) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const instance = (model as any).fromDB?.(record) ?? (new model(record) as T);
        results.push(instance);
      }
    }

    // Apply ordering
    if (plan.ordering && plan.ordering.length > 0) {
      results.sort((a, b) => {
        for (const order of plan.ordering) {
          const aVal = (a as Record<string, unknown>)[order.field];
          const bVal = (b as Record<string, unknown>)[order.field];

          let comparison = 0;
          if (aVal != null && bVal != null) {
            if (aVal < bVal) comparison = -1;
            else if (aVal > bVal) comparison = 1;
          }

          if (comparison !== 0) {
            return order.direction === 'desc' ? -comparison : comparison;
          }
        }
        return 0;
      });
    }

    // Apply offset and limit
    if (plan.offset) {
      results = results.slice(plan.offset);
    }
    if (plan.limit) {
      results = results.slice(0, plan.limit);
    }

    return results;
  }

  /**
   * Count records matching query
   */
  async count<T>(model: ModelClass<T>, _query: QueryPlan): Promise<number> {
    // For now, just count all matching records
    // TODO: Use query filters
    const results = await this.find(model, {});
    return results.length;
  }

  /**
   * Execute raw query (not supported in memory adapter)
   */
  async executeRaw<T>(_model: ModelClass<T>, _query: string | object, _params?: unknown[]): Promise<T[]> {
    throw new Error('executeRaw is not supported by MemoryAdapter');
  }

  /**
   * Compile filter to backend-specific format (no-op for memory adapter)
   */
  compileFilter(filter: Record<string, unknown>): any {
    // For memory adapter, just return the filter as-is
    return filter;
  }

  /**
   * Check if any records exist matching query
   */
  async exists<T>(model: ModelClass<T>, query: QueryPlan<T>): Promise<boolean> {
    const count = await this.count(model, query);
    return count > 0;
  }

  /**
   * Clear all data (useful for testing)
   */
  clear(): void {
    this.storage.clear();
    this.autoIncrementCounters.clear();
  }

  /**
   * Get all data for a table (useful for debugging)
   */
  getTableData(tableName: string): Record<string, unknown>[] {
    const table = this.getTable(tableName);
    return Array.from(table.values());
  }

  /**
   * Get the number of records in a table
   */
  getTableSize(tableName: string): number {
    const table = this.getTable(tableName);
    return table.size;
  }
}
