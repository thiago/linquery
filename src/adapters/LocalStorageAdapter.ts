/**
 * LocalStorageAdapter - Browser localStorage backend adapter
 *
 * Features:
 * - Stores data in browser localStorage
 * - Automatic JSON serialization/deserialization
 * - Namespace per model (prefix: "linquery:")
 * - Auto-increment ID generation
 * - Full CRUD operations
 * - Query filtering with lookups
 * - Ordering, pagination
 * - ~5-10MB storage limit (browser dependent)
 *
 * Use Cases:
 * - PWAs and web apps
 * - Client-side data persistence
 * - Prototypes and demos
 * - Small datasets that need to persist across sessions
 *
 * Limitations:
 * - Only works in browser environment
 * - Storage limit (~5-10MB depending on browser)
 * - Synchronous API (may block UI with large datasets)
 * - No transactions
 * - Data stored as JSON (not optimized for complex queries)
 *
 * @example
 * ```typescript
 * import { LocalStorageAdapter } from 'linquery/adapters';
 *
 * const adapter = new LocalStorageAdapter({ prefix: 'myapp' });
 * await adapter.connect();
 *
 * class User extends Model {
 *   static adapter = adapter;
 * }
 *
 * const user = await User.objects.create({ name: 'John' });
 * ```
 */

import type { BackendAdapter, ModelClass, QueryPlan, CompiledFilter, OrderingClause } from '../types';

export interface LocalStorageAdapterOptions {
  /**
   * Prefix for localStorage keys
   * @default "linquery"
   */
  prefix?: string;

  /**
   * Clear all data on connect
   * @default false
   */
  clearOnConnect?: boolean;
}

/**
 * LocalStorageAdapter - Store data in browser localStorage
 */
export class LocalStorageAdapter implements BackendAdapter {
  private prefix: string;
  private clearOnConnect: boolean;
  private isConnected = false;
  private storage: Storage | null = null;

  constructor(options: LocalStorageAdapterOptions = {}) {
    this.prefix = options.prefix || 'linquery';
    this.clearOnConnect = options.clearOnConnect || false;
  }

  /**
   * Connect to localStorage
   */
  async connect(): Promise<void> {
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new Error('LocalStorageAdapter requires browser environment with localStorage');
    }

    this.storage = window.localStorage;
    this.isConnected = true;

    if (this.clearOnConnect) {
      this.clearAll();
    }
  }

  /**
   * Disconnect (no-op for localStorage)
   */
  async disconnect(): Promise<void> {
    this.isConnected = false;
    this.storage = null;
  }

  /**
   * Get storage key for a table
   */
  private getTableKey(tableName: string): string {
    return `${this.prefix}:${tableName}`;
  }

  /**
   * Get storage key for auto-increment counter
   */
  private getCounterKey(tableName: string): string {
    return `${this.prefix}:${tableName}:_counter`;
  }

  /**
   * Get table name from model
   */
  private getTableName<T>(model: ModelClass<T>): string {
    if (typeof model.getTableName === 'function') {
      return model.getTableName();
    }
    return model.name.toLowerCase();
  }

  /**
   * Ensure connected
   */
  private ensureConnected(): void {
    if (!this.isConnected || !this.storage) {
      throw new Error('LocalStorageAdapter not connected. Call connect() first.');
    }
  }

  /**
   * Get all records from a table
   */
  private getTableData(tableName: string): Record<string, any>[] {
    this.ensureConnected();
    const key = this.getTableKey(tableName);
    const data = this.storage!.getItem(key);
    return data ? JSON.parse(data) : [];
  }

  /**
   * Save all records to a table
   */
  private setTableData(tableName: string, data: Record<string, any>[]): void {
    this.ensureConnected();
    const key = this.getTableKey(tableName);
    this.storage!.setItem(key, JSON.stringify(data));
  }

  /**
   * Get next auto-increment ID
   */
  private getNextId(tableName: string): number {
    this.ensureConnected();
    const key = this.getCounterKey(tableName);
    const counter = this.storage!.getItem(key);
    const nextId = counter ? parseInt(counter, 10) + 1 : 1;
    this.storage!.setItem(key, nextId.toString());
    return nextId;
  }

  /**
   * Create a new record
   */
  async create<T>(model: ModelClass<T>, data: Record<string, unknown>): Promise<T> {
    const tableName = this.getTableName(model);
    const records = this.getTableData(tableName);

    // Generate ID if not provided
    if (!data.id) {
      data.id = this.getNextId(tableName);
    }

    records.push(data);
    this.setTableData(tableName, records);

    return (model as any).fromDB?.(data) ?? (new model(data) as T);
  }

  /**
   * Find records matching filters
   */
  async find<T>(model: ModelClass<T>, filters: Record<string, unknown>): Promise<T[]> {
    const tableName = this.getTableName(model);
    const records = this.getTableData(tableName);

    // Apply filters
    const filtered = records.filter((record) => {
      return Object.entries(filters).every(([key, value]) => {
        return record[key] === value;
      });
    });

    return filtered.map((data) => (model as any).fromDB?.(data) ?? (new model(data) as T));
  }

  /**
   * Get a single record by ID
   */
  async get<T>(model: ModelClass<T>, id: unknown): Promise<T | null> {
    const tableName = this.getTableName(model);
    const records = this.getTableData(tableName);
    const record = records.find((r) => r.id === id);

    if (!record) return null;

    return (model as any).fromDB?.(record) ?? (new model(record) as T);
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
    const records = this.getTableData(tableName);

    let updated = false;
    const updatedRecords = records.map((record) => {
      const matches = Object.entries(filters).every(([key, value]) => {
        return record[key] === value;
      });

      if (matches) {
        updated = true;
        return { ...record, ...data };
      }
      return record;
    });

    if (updated) {
      this.setTableData(tableName, updatedRecords);
    }
  }

  /**
   * Delete records matching filters
   */
  async delete<T>(model: ModelClass<T>, filters: Record<string, unknown>): Promise<void> {
    const tableName = this.getTableName(model);
    const records = this.getTableData(tableName);

    const filtered = records.filter((record) => {
      return !Object.entries(filters).every(([key, value]) => {
        return record[key] === value;
      });
    });

    this.setTableData(tableName, filtered);
  }

  /**
   * Advanced list with query plan
   */
  async list<T>(model: ModelClass<T>, plan: QueryPlan): Promise<T[]> {
    const tableName = this.getTableName(model);
    let records = this.getTableData(tableName);

    // Apply filters
    records = this.applyFilters(records, plan.filters);

    // Apply excludes
    records = this.applyExcludes(records, plan.excludes);

    // Apply ordering
    records = this.applyOrdering(records, plan.ordering);

    // Apply offset and limit
    if (plan.offset) {
      records = records.slice(plan.offset);
    }
    if (plan.limit) {
      records = records.slice(0, plan.limit);
    }

    return records.map((data) => (model as any).fromDB?.(data) ?? (new model(data) as T));
  }

  /**
   * Count records matching query
   */
  async count<T>(model: ModelClass<T>, plan: QueryPlan): Promise<number> {
    const tableName = this.getTableName(model);
    let records = this.getTableData(tableName);

    // Apply filters
    records = this.applyFilters(records, plan.filters);

    // Apply excludes
    records = this.applyExcludes(records, plan.excludes);

    return records.length;
  }

  /**
   * Check if records exist matching query
   */
  async exists<T>(model: ModelClass<T>, plan: QueryPlan): Promise<boolean> {
    const count = await this.count(model, plan);
    return count > 0;
  }

  /**
   * Apply filters to records
   */
  private applyFilters(records: Record<string, any>[], filters: CompiledFilter[]): Record<string, any>[] {
    return records.filter((record) => {
      return filters.every((filter) => this.matchesFilter(record, filter));
    });
  }

  /**
   * Apply excludes to records
   */
  private applyExcludes(records: Record<string, any>[], excludes: CompiledFilter[]): Record<string, any>[] {
    return records.filter((record) => {
      return !excludes.some((filter) => this.matchesFilter(record, filter));
    });
  }

  /**
   * Check if record matches a filter
   */
  private matchesFilter(record: Record<string, any>, filter: CompiledFilter): boolean {
    const value = record[filter.field];
    const filterValue = filter.value;

    switch (filter.lookup) {
      case 'exact':
        return value === filterValue;
      case 'iexact':
        return String(value).toLowerCase() === String(filterValue).toLowerCase();
      case 'contains':
        return String(value).includes(String(filterValue));
      case 'icontains':
        return String(value).toLowerCase().includes(String(filterValue).toLowerCase());
      case 'startswith':
        return String(value).startsWith(String(filterValue));
      case 'istartswith':
        return String(value).toLowerCase().startsWith(String(filterValue).toLowerCase());
      case 'endswith':
        return String(value).endsWith(String(filterValue));
      case 'iendswith':
        return String(value).toLowerCase().endsWith(String(filterValue).toLowerCase());
      case 'gt':
        return value > (filterValue as number);
      case 'gte':
        return value >= (filterValue as number);
      case 'lt':
        return value < (filterValue as number);
      case 'lte':
        return value <= (filterValue as number);
      case 'in':
        return Array.isArray(filterValue) && filterValue.includes(value);
      case 'range':
        return Array.isArray(filterValue) && value >= filterValue[0] && value <= filterValue[1];
      case 'isnull':
        return filterValue ? value === null || value === undefined : value !== null && value !== undefined;
      case 'year':
        return value instanceof Date && value.getFullYear() === filterValue;
      case 'month':
        return value instanceof Date && value.getMonth() + 1 === filterValue;
      case 'day':
        return value instanceof Date && value.getDate() === filterValue;
      default:
        return false;
    }
  }

  /**
   * Apply ordering to records
   */
  private applyOrdering(records: Record<string, any>[], ordering: OrderingClause[]): Record<string, any>[] {
    if (ordering.length === 0) {
      return records;
    }

    return [...records].sort((a, b) => {
      for (const order of ordering) {
        const aVal = a[order.field];
        const bVal = b[order.field];

        let comparison = 0;
        if (aVal < bVal) comparison = -1;
        else if (aVal > bVal) comparison = 1;

        if (comparison !== 0) {
          return order.direction === 'asc' ? comparison : -comparison;
        }
      }
      return 0;
    });
  }

  /**
   * Clear all data for this adapter
   */
  clearAll(): void {
    this.ensureConnected();
    const keysToRemove: string[] = [];

    for (let i = 0; i < this.storage!.length; i++) {
      const key = this.storage!.key(i);
      if (key && key.startsWith(this.prefix + ':')) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => this.storage!.removeItem(key));
  }

  /**
   * Get storage stats
   */
  getStats(): { tables: string[]; totalKeys: number; estimatedSize: number } {
    this.ensureConnected();
    const tables = new Set<string>();
    let totalKeys = 0;
    let estimatedSize = 0;

    for (let i = 0; i < this.storage!.length; i++) {
      const key = this.storage!.key(i);
      if (key && key.startsWith(this.prefix + ':')) {
        totalKeys++;
        const value = this.storage!.getItem(key);
        if (value) {
          estimatedSize += key.length + value.length;
        }

        // Extract table name
        const parts = key.replace(this.prefix + ':', '').split(':');
        if (parts[0] && !parts[0].startsWith('_')) {
          tables.add(parts[0]);
        }
      }
    }

    return {
      tables: Array.from(tables),
      totalKeys,
      estimatedSize, // in characters (roughly bytes for ASCII)
    };
  }
}
