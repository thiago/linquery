/**
 * Core type definitions for Linquery
 */

// Base model instance type
export interface ModelInstance<T = unknown> extends Record<string, unknown> {
  id?: number | string;
  _model?: T; // Type parameter marker (not used at runtime)
}

// Extract field names from model
export type FieldNames<T> = {
  [K in keyof T]: T[K] extends (...args: unknown[]) => unknown ? never : K;
}[keyof T];

// Field lookup types
export type StringLookup =
  | 'exact'
  | 'iexact'
  | 'contains'
  | 'icontains'
  | 'startswith'
  | 'istartswith'
  | 'endswith'
  | 'iendswith'
  | 'in'
  | 'isnull';

export type NumberLookup =
  | 'exact'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'range'
  | 'isnull';

export type DateLookup =
  | 'exact'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'year'
  | 'month'
  | 'day'
  | 'isnull';

export type BooleanLookup = 'exact' | 'isnull';

export type Lookup = StringLookup | NumberLookup | DateLookup | BooleanLookup;

// ============================================================================
// Advanced Type System for Field Lookups with Autocomplete
// ============================================================================

/**
 * Maps field types to their available lookups
 * This provides type-safe autocomplete for field__lookup combinations
 */
export type LookupsForType<T> =
  T extends string ? StringLookup :
  T extends number ? NumberLookup :
  T extends Date ? DateLookup :
  T extends boolean ? BooleanLookup :
  'exact' | 'isnull';  // Fallback for unknown types

/**
 * Generates all possible lookup keys for a field
 * Example: 'age' → 'age' | 'age__gt' | 'age__gte' | 'age__lt' | ...
 */
export type FieldLookupKeys<
  TField extends string,
  TValue
> = TField | `${TField}__${LookupsForType<TValue>}`;

/**
 * Extracts the base type from a field, unwrapping optional and undefined
 * Example: string | undefined → string
 */
export type UnwrapFieldType<T> =
  T extends undefined | null ? never :
  T extends Date | undefined ? Date :
  T extends string | undefined ? string :
  T extends number | undefined ? number :
  T extends boolean | undefined ? boolean :
  T;

/**
 * Gets the expected value type for a lookup operation
 * Example: For 'in' lookup on number field → number[]
 */
export type LookupValueType<TField, TLookup extends string> =
  TLookup extends 'in' ? TField[] :
  TLookup extends 'range' ? [TField, TField] :
  TLookup extends 'isnull' ? boolean :
  TField;

/**
 * Maps a field type to its lookup value type
 * Handles the special cases for 'in', 'range', 'isnull', and date components
 */
type LookupValue<TFieldType, TLookup extends string> =
  TLookup extends 'in' ? TFieldType[] :
  TLookup extends 'range' ? [TFieldType, TFieldType] :
  TLookup extends 'isnull' ? boolean :
  TLookup extends 'year' | 'month' | 'day' ? number :
  TFieldType;

/**
 * Generate all valid lookup combinations for a single field
 * Example: For field 'age' of type number, generates:
 *   { age?: number; age__gt?: number; age__gte?: number; ... }
 */
type FieldWithLookups<K extends string, TFieldType> = {
  [L in LookupsForType<TFieldType> as `${K}__${L}`]?: LookupValue<TFieldType, L>;
} & {
  [P in K]?: TFieldType;
};

/**
 * Union to Intersection helper
 * Converts a union of types into an intersection
 */
type UnionToIntersection<U> =
  (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never;

/**
 * Advanced type-safe filter for model queries
 *
 * Provides full autocomplete and type checking for:
 * - Direct field access: { age: 25, name: 'John' }
 * - Field lookups with autocomplete: { age__gt: 25, name__contains: 'John' }
 * - Type validation: Ensures lookup values match field types
 *
 * @example
 * ```typescript
 * interface Book {
 *   title: string;
 *   pages: number;
 *   published: boolean;
 * }
 *
 * // ✅ Full autocomplete for fields and lookups
 * const filter: TypedFilter<Book> = {
 *   title: 'Django',           // Direct access - autocomplete works
 *   pages__gt: 100,            // Lookup - autocomplete works!
 *   pages__in: [100, 200],     // Array type validated
 *   published: true,           // Boolean field
 * };
 *
 * // ❌ TypeScript errors:
 * // pages__gt: '100'          // Error: string not assignable to number
 * // pages__invalid: 100       // Error: invalid lookup
 * // invalidField: 'x'         // Error: field doesn't exist
 * ```
 */
type NonFunctionKeys<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? never : K;
}[keyof T];

export type TypedFilter<T> = Partial<UnionToIntersection<{
  [K in NonFunctionKeys<T>]: FieldWithLookups<K & string, UnwrapFieldType<T[K]>>;
}[NonFunctionKeys<T>]>>;

// Query filter types
export type QueryFilters = Record<string, unknown>;

// Ordering field (supports '-' prefix for descending)
export type OrderingField<T> = FieldNames<T> | `-${FieldNames<T> & string}`;

// Validator function type
export type ValidatorFn<T = unknown> = (value: T) => void | Promise<void>;

// Field options
export interface FieldOptions<T = unknown> {
  required?: boolean;
  default?: T | (() => T);
  unique?: boolean;
  validators?: ValidatorFn<T>[];
  dbColumn?: string;
  helpText?: string;
}

// Validation error structure
export interface ValidationErrors {
  [field: string]: string[];
}

// Model metadata
export interface ModelMeta {
  tableName?: string;
  ordering?: string[];
  uniqueTogether?: string[][];
  indexes?: IndexDefinition[];
  abstract?: boolean;
}

export interface IndexDefinition {
  fields: string[];
  unique?: boolean;
  name?: string;
}

// Query plan for adapters
export interface QueryPlan<T = unknown> {
  model: ModelClass<T>;
  filters: CompiledFilter[];
  excludes: CompiledFilter[];
  ordering: OrderingClause[];
  limit?: number;
  offset?: number;
  selectRelated: RelationPath[];
  prefetchRelated: RelationPath[];
  only?: string[];
  defer?: string[];
}

export interface CompiledFilter {
  field: string;
  lookup: Lookup;
  value: unknown;
  path?: string[];
}

export interface OrderingClause {
  field: string;
  direction: 'asc' | 'desc';
}

// Relation path for eager loading (e.g., 'user', 'user__profile')
export type RelationPath = string;

// Filter type (for query filters)
export type Filter = Record<string, unknown>;

// Field definition (map of field names to Field instances)
// T represents the model type for future type safety
export type FieldDefinition<T = unknown> = Record<string, unknown> & { _model?: T };

// Model options for initialization
export interface ModelOptions {
  tableName?: string;
  primaryKey?: string;
  adapter?: BackendAdapter;
  ordering?: string[];
  uniqueTogether?: string[][];
  indexes?: IndexDefinition[];
}

// Model class type with static methods
export interface ModelClass<T = unknown> {
  new (...args: any[]): T;
  name: string;
  getMeta?: () => unknown;
  getFields?: () => Map<string, unknown>;
  getField?: (name: string) => unknown;
  getPrimaryKey?: () => string;
  getAdapter?: () => BackendAdapter | undefined;
  setAdapter?: (adapter: BackendAdapter) => void;
  getTableName?: () => string;
  fromDB?: (data: Record<string, unknown>) => T;
}

// Adapter interface
export interface BackendAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  // Basic CRUD operations
  create<T>(model: ModelClass<T>, data: Record<string, unknown>): Promise<T>;
  find<T>(model: ModelClass<T>, filters: Record<string, unknown>): Promise<T[]>;
  update<T>(model: ModelClass<T>, filters: Record<string, unknown>, data: Record<string, unknown>): Promise<void>;
  delete<T>(model: ModelClass<T>, filters: Record<string, unknown>): Promise<void>;

  // Single record operations
  get<T>(model: ModelClass<T>, id: unknown): Promise<T | null>;

  // Advanced query operations
  list<T>(model: ModelClass<T>, plan: QueryPlan): Promise<T[]>;
  count<T>(model: ModelClass<T>, query: QueryPlan): Promise<number>;
  exists?<T>(model: ModelClass<T>, query: QueryPlan): Promise<boolean>;

  // Bulk operations
  bulkCreate?<T>(model: ModelClass<T>, items: Record<string, unknown>[]): Promise<T[]>;
  bulkUpdate?<T>(model: ModelClass<T>, items: Record<string, unknown>[]): Promise<void>;
  bulkDelete?<T>(model: ModelClass<T>, filters: Record<string, unknown>[]): Promise<void>;

  // Transaction support
  transaction?<T>(callback: () => Promise<T>): Promise<T>;

  // Raw query execution
  executeRaw?<T>(model: ModelClass<T>, query: string | object, params?: unknown[]): Promise<T[]>;

  // Filter compilation
  compileFilter?(filter: Record<string, unknown>): CompiledFilter;
}

// Signal types (SignalHandler is now in src/core/Signal.ts)
export enum SignalType {
  PRE_INIT = 'pre_init',
  POST_INIT = 'post_init',
  PRE_SAVE = 'pre_save',
  POST_SAVE = 'post_save',
  PRE_DELETE = 'pre_delete',
  POST_DELETE = 'post_delete',
  M2M_CHANGED = 'm2m_changed',
  PRE_SYNC = 'pre_sync',
  POST_SYNC = 'post_sync',
  SYNC_CONFLICT = 'sync_conflict',
}

// Error codes
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  DOES_NOT_EXIST = 'DOES_NOT_EXIST',
  MULTIPLE_OBJECTS_RETURNED = 'MULTIPLE_OBJECTS_RETURNED',
  INVALID_QUERY = 'INVALID_QUERY',
  RELATED_OBJECT_DOES_NOT_EXIST = 'RELATED_OBJECT_DOES_NOT_EXIST',
  INVALID_RELATIONSHIP = 'INVALID_RELATIONSHIP',
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  INTEGRITY_ERROR = 'INTEGRITY_ERROR',
  UNIQUE_CONSTRAINT = 'UNIQUE_CONSTRAINT',
  FOREIGN_KEY_CONSTRAINT = 'FOREIGN_KEY_CONSTRAINT',
  TRANSACTION_ERROR = 'TRANSACTION_ERROR',
  SYNC_CONFLICT = 'SYNC_CONFLICT',
  OFFLINE_ERROR = 'OFFLINE_ERROR',
}
