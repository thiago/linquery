/**
 * DexieAdapter - IndexedDB backend adapter using Dexie.js
 *
 * Features:
 * - Browser IndexedDB storage via Dexie.js
 * - Async/Promise-based API
 * - Automatic indexing and querying
 * - Transaction support
 * - Advanced filtering with 18 lookup types
 * - Ordering, pagination, and counting
 * - Unlimited storage (browser quota dependent)
 *
 * Use Cases:
 * - PWAs with large offline datasets
 * - Complex queries and indexing needs
 * - Web applications requiring structured storage
 * - Offline-first applications
 *
 * Installation:
 * ```bash
 * npm install dexie
 * ```
 *
 * Setup:
 * ```typescript
 * import Dexie from 'dexie';
 * import { DexieAdapter } from 'linquery/adapters';
 *
 * const db = new Dexie('myDatabase');
 * db.version(1).stores({
 *   posts: '++id, title, published, views',
 *   users: '++id, name, email'
 * });
 *
 * const adapter = new DexieAdapter(db);
 *
 * class Post extends Model {
 *   static adapter = adapter;
 * }
 * ```
 *
 * Important:
 * - Dexie must be installed separately: `npm install dexie`
 * - You must define table schemas when creating the Dexie instance
 * - Table names in Dexie should match your Model names (lowercase)
 * - IndexedDB only works in browser environments
 *
 * Limitations:
 * - Only works in browser environment
 * - Requires Dexie.js to be installed
 * - Storage subject to browser quota
 * - Table schema must be defined in Dexie instance
 */

import type { BackendAdapter, ModelClass, QueryPlan, CompiledFilter, OrderingClause } from '../types';

export interface DexieAdapterOptions {
  /**
   * Whether to clear all tables on connect
   * @default false
   */
  clearOnConnect?: boolean;

  /**
   * Automatically generate Dexie schema from Models
   * When true, adapter will auto-generate schema on connect()
   * @default true
   */
  autoSchema?: boolean;

  /**
   * Database version for auto-generated schema
   * @default 1
   */
  version?: number;
}

/**
 * Type definition for Dexie instance (minimal interface)
 * This allows the adapter to work without importing Dexie
 */
export interface DexieDatabase {
  table<T = any>(tableName: string): DexieTable<T>;
  version(version: number): { stores(schema: Record<string, string>): void };
  open(): Promise<void>;
  close(): void;
  delete(): Promise<void>;
  isOpen(): boolean;
  tables: Array<{ name: string }>;
}

export interface DexieTable<T = any> {
  add(item: T): Promise<any>;
  put(item: T): Promise<any>;
  get(id: any): Promise<T | undefined>;
  where(field: string): DexieWhereClause<T>;
  toArray(): Promise<T[]>;
  count(): Promise<number>;
  clear(): Promise<void>;
  delete(id: any): Promise<void>;
  bulkAdd(items: T[]): Promise<any>;
  bulkPut(items: T[]): Promise<any>;
  bulkDelete(ids: any[]): Promise<void>;
  update(id: any, changes: Partial<T>): Promise<number>;
  filter(fn: (item: T) => boolean): DexieCollection<T>;
  toCollection(): DexieCollection<T>;
}

export interface DexieWhereClause<T = any> {
  equals(value: any): DexieCollection<T>;
  above(value: any): DexieCollection<T>;
  aboveOrEqual(value: any): DexieCollection<T>;
  below(value: any): DexieCollection<T>;
  belowOrEqual(value: any): DexieCollection<T>;
  between(lower: any, upper: any, includeLower?: boolean, includeUpper?: boolean): DexieCollection<T>;
  anyOf(values: any[]): DexieCollection<T>;
}

export interface DexieCollection<T = any> {
  toArray(): Promise<T[]>;
  count(): Promise<number>;
  delete(): Promise<number>;
  modify(changes: Partial<T>): Promise<number>;
  filter(fn: (item: T) => boolean): DexieCollection<T>;
  offset(n: number): DexieCollection<T>;
  limit(n: number): DexieCollection<T>;
  sortBy(field: string): Promise<T[]>;
  reverse(): DexieCollection<T>;
  and(fn: (item: T) => boolean): DexieCollection<T>;
}

/**
 * DexieAdapter - IndexedDB storage using Dexie.js
 *
 * Note: Dexie must be installed separately
 */
export class DexieAdapter implements BackendAdapter {
  private db: DexieDatabase;
  private clearOnConnect: boolean;
  private autoSchema: boolean;
  private version: number;
  private isConnected = false;
  private registeredModels: Map<string, ModelClass<any>> = new Map();

  /**
   * Create a new DexieAdapter
   *
   * @param db - Dexie instance (must be configured with table schemas)
   * @param options - Adapter options
   *
   * @example
   * ```typescript
   * import Dexie from 'dexie';
   * import { DexieAdapter } from 'linquery/adapters';
   *
   * const db = new Dexie('myApp');
   * db.version(1).stores({
   *   posts: '++id, title, published, views'
   * });
   *
   * const adapter = new DexieAdapter(db);
   * ```
   */
  constructor(db: DexieDatabase, options: DexieAdapterOptions = {}) {
    this.db = db;
    this.clearOnConnect = options.clearOnConnect || false;
    this.autoSchema = options.autoSchema ?? true;
    this.version = options.version || 1;
  }

  /**
   * Register a model for auto-schema generation
   * Called automatically when Model.setAdapter() is used
   */
  registerModel<T>(model: ModelClass<T>): void {
    const tableName = this.getTableName(model);
    this.registeredModels.set(tableName, model);
  }

  /**
   * Extract Dexie schema string from a Model's fields
   * Returns something like: '++id, title, published, views'
   */
  private extractSchemaFromModel<T>(model: ModelClass<T>): string {
    const fields = (model as any).getFields?.() as Map<string, any> | undefined;

    if (!fields) {
      // Fallback: just auto-increment id
      return '++id';
    }

    const indexedFields: string[] = [];

    // Always start with auto-increment primary key
    const schemaFields = ['++id'];

    // Add indexed fields
    for (const [fieldName, field] of fields.entries()) {
      if (field.index === true || field.unique === true) {
        indexedFields.push(fieldName);
      }
    }

    // Combine: '++id, field1, field2, ...'
    if (indexedFields.length > 0) {
      schemaFields.push(...indexedFields);
    }

    return schemaFields.join(', ');
  }

  /**
   * Generate full Dexie schema object from registered models
   */
  private generateSchema(): Record<string, string> {
    const schema: Record<string, string> = {};

    for (const [tableName, model] of this.registeredModels.entries()) {
      schema[tableName] = this.extractSchemaFromModel(model);
    }

    return schema;
  }

  /**
   * Connect to the database
   */
  async connect(): Promise<void> {
    // Auto-generate and apply schema if enabled
    if (this.autoSchema && this.registeredModels.size > 0) {
      const schema = this.generateSchema();
      this.db.version(this.version).stores(schema);
    }

    if (!this.db.isOpen()) {
      await this.db.open();
    }
    this.isConnected = true;

    if (this.clearOnConnect) {
      await this.clearAll();
    }
  }

  /**
   * Disconnect from the database
   */
  async disconnect(): Promise<void> {
    if (this.db.isOpen()) {
      this.db.close();
    }
    this.isConnected = false;
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
    if (!this.isConnected) {
      throw new Error('DexieAdapter not connected. Call connect() first.');
    }
  }

  /**
   * Create a new record
   */
  async create<T>(model: ModelClass<T>, data: Record<string, unknown>): Promise<T> {
    this.ensureConnected();
    const tableName = this.getTableName(model);
    const table = this.db.table(tableName);

    // Dexie auto-increments if id is not provided and schema has ++id
    const id = await table.add(data);

    // If id was auto-generated, add it to the data
    if (!data.id && id !== undefined) {
      data.id = id;
    }

    return (model as any).fromDB?.(data) ?? (new model(data) as T);
  }

  /**
   * Find records matching filters
   */
  async find<T>(model: ModelClass<T>, filters: Record<string, unknown>): Promise<T[]> {
    this.ensureConnected();
    const tableName = this.getTableName(model);
    const table = this.db.table(tableName);

    // Simple exact match filters
    const records = await table.filter((record: any) => {
      return Object.entries(filters).every(([key, value]) => {
        return record[key] === value;
      });
    }).toArray();

    return records.map((data) => (model as any).fromDB?.(data) ?? (new model(data) as T));
  }

  /**
   * Get a single record by ID
   */
  async get<T>(model: ModelClass<T>, id: unknown): Promise<T | null> {
    this.ensureConnected();
    const tableName = this.getTableName(model);
    const table = this.db.table(tableName);

    const record = await table.get(id);

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
    this.ensureConnected();
    const tableName = this.getTableName(model);
    const table = this.db.table(tableName);

    // Find matching records
    const records = await table.filter((record: any) => {
      return Object.entries(filters).every(([key, value]) => {
        return record[key] === value;
      });
    }).toArray();

    // Update each record
    for (const record of records) {
      const updated = { ...record, ...data };
      await table.put(updated);
    }
  }

  /**
   * Delete records matching filters
   */
  async delete<T>(model: ModelClass<T>, filters: Record<string, unknown>): Promise<void> {
    this.ensureConnected();
    const tableName = this.getTableName(model);
    const table = this.db.table(tableName);

    // Find matching records
    const records = await table.filter((record: any) => {
      return Object.entries(filters).every(([key, value]) => {
        return record[key] === value;
      });
    }).toArray();

    // Delete by ID
    const ids = records.map((r: any) => r.id).filter(id => id !== undefined);
    if (ids.length > 0) {
      await table.bulkDelete(ids);
    }
  }

  /**
   * Advanced list with query plan
   */
  async list<T>(model: ModelClass<T>, plan: QueryPlan): Promise<T[]> {
    this.ensureConnected();
    const tableName = this.getTableName(model);
    const table = this.db.table(tableName);

    // Get all records as base
    let collection = table.toCollection();

    // Apply filters
    collection = collection.filter((record: any) => {
      return this.applyFilters(record, plan.filters);
    });

    // Apply excludes
    collection = collection.filter((record: any) => {
      return !this.applyFilters(record, plan.excludes);
    });

    // Get array to apply ordering and pagination
    let records = await collection.toArray();

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
    this.ensureConnected();
    const tableName = this.getTableName(model);
    const table = this.db.table(tableName);

    const count = await table.filter((record: any) => {
      return this.applyFilters(record, plan.filters) && !this.applyFilters(record, plan.excludes);
    }).count();

    return count;
  }

  /**
   * Check if records exist matching query
   */
  async exists<T>(model: ModelClass<T>, plan: QueryPlan): Promise<boolean> {
    const count = await this.count(model, plan);
    return count > 0;
  }

  /**
   * Apply filters to a record
   */
  private applyFilters(record: Record<string, any>, filters: CompiledFilter[]): boolean {
    return filters.every((filter) => this.matchesFilter(record, filter));
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
   * Clear all tables
   */
  async clearAll(): Promise<void> {
    this.ensureConnected();
    for (const table of this.db.tables) {
      await this.db.table(table.name).clear();
    }
  }

  /**
   * Get storage stats
   */
  async getStats(): Promise<{ tables: string[]; counts: Record<string, number> }> {
    this.ensureConnected();
    const tables = this.db.tables.map(t => t.name);
    const counts: Record<string, number> = {};

    for (const tableName of tables) {
      counts[tableName] = await this.db.table(tableName).count();
    }

    return { tables, counts };
  }
}
