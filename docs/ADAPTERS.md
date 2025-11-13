# Adapters

Adapters are the bridge between ORM.js and your data sources. This document explains how to use existing adapters and create your own.

## Table of Contents

- [Overview](#overview)
- [Built-in Adapters](#built-in-adapters)
- [Creating Custom Adapters](#creating-custom-adapters)
- [Adapter Interface](#adapter-interface)
- [QueryPlan](#queryplan)
- [Cross-Adapter Relationships](#cross-adapter-relationships)
- [Best Practices](#best-practices)

## Overview

Adapters implement the `BackendAdapter` interface, translating ORM operations into backend-specific queries.

```
┌─────────────────────────────────┐
│      ORM Core Layer             │
│  (Model, QuerySet, Manager)     │
└────────────┬────────────────────┘
             │ QueryPlan
             ▼
┌─────────────────────────────────┐
│      BackendAdapter             │
│  Translates QueryPlan to        │
│  backend-specific operations    │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│      Data Source                │
│  (GraphQL, SQL, Memory, etc)    │
└─────────────────────────────────┘
```

## Built-in Adapters

### MemoryAdapter

In-memory storage. Useful for testing and client-side state management.

```typescript
import { MemoryAdapter } from 'orm-js/adapters';

const adapter = new MemoryAdapter({
  // Optional: pre-populate data
  initialData: {
    users: [
      { id: 1, name: 'John' },
      { id: 2, name: 'Jane' },
    ],
  },
});

class User extends Model {
  static adapter = adapter;
  name = new CharField();
}
```

**Features:**
- No dependencies
- Synchronous operations (wrapped in Promises for consistency)
- Full query support
- Useful for testing
- Works in browser and Node.js

**Limitations:**
- Data lost on restart
- No transactions
- Limited to single process

### LocalStorageAdapter

Browser localStorage persistence.

```typescript
import { LocalStorageAdapter } from '@orm-js/adapter-localstorage';

const adapter = new LocalStorageAdapter({
  prefix: 'myapp_',  // Key prefix in localStorage
});

class User extends Model {
  static adapter = adapter;
  name = new CharField();
}
```

**Features:**
- Persists across browser sessions
- Simple API
- Works offline
- ~5-10MB storage limit

**Limitations:**
- Browser only
- Synchronous (blocks UI for large datasets)
- Limited storage
- String-based (serialization overhead)

### DexieAdapter

IndexedDB via Dexie.js. Best for offline-first browser apps.

```typescript
import { DexieAdapter } from '@orm-js/adapter-dexie';

const adapter = new DexieAdapter({
  dbName: 'myapp',
  version: 1,
});

class User extends Model {
  static adapter = adapter;
  name = new CharField();
}
```

**Features:**
- Large storage capacity (hundreds of MB)
- Async operations (non-blocking)
- Indexes for fast queries
- Transaction support
- Works offline

**Limitations:**
- Browser only
- More complex than localStorage
- IndexedDB quirks across browsers

### GraphQLAdapter

Query GraphQL APIs.

```typescript
import { GraphQLAdapter } from '@orm-js/adapter-graphql';

const adapter = new GraphQLAdapter({
  endpoint: 'https://api.example.com/graphql',

  // Optional authentication
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
  },

  // Optional: custom query builder
  queryBuilder: customQueryBuilder,
});

class User extends Model {
  static adapter = adapter;

  static meta = {
    // GraphQL type name
    typeName: 'User',
  };

  name = new CharField();
  email = new CharField();
}
```

**Features:**
- Fetch from GraphQL APIs
- Automatic query generation
- Customizable query/mutation builders
- Supports relationships via GraphQL schema

**Configuration:**

```typescript
const adapter = new GraphQLAdapter({
  endpoint: '/graphql',

  // Map ORM operations to GraphQL operations
  operations: {
    list: 'users',           // Query for all
    get: 'user',             // Query for one
    create: 'createUser',    // Mutation to create
    update: 'updateUser',    // Mutation to update
    delete: 'deleteUser',    // Mutation to delete
  },

  // Custom query generator
  queryBuilder: (operation, model, params) => {
    return {
      query: gql`...`,
      variables: {...},
    };
  },
});
```

### SQLAdapter (PostgreSQL, MySQL, SQLite)

SQL database support.

```typescript
import { PostgresAdapter } from '@orm-js/adapter-postgres';

const adapter = new PostgresAdapter({
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'postgres',
  password: 'secret',

  // Connection pool settings
  pool: {
    min: 2,
    max: 10,
  },
});

class User extends Model {
  static adapter = adapter;

  static meta = {
    tableName: 'users',
  };

  name = new CharField({ maxLength: 100 });
  email = new CharField({ maxLength: 255 });
}
```

**Features:**
- Full SQL power
- Transactions
- Migrations (adapter-specific)
- Indexes, constraints
- High performance

### RESTAdapter

Query REST APIs.

```typescript
import { RESTAdapter } from '@orm-js/adapter-rest';

const adapter = new RESTAdapter({
  baseURL: 'https://api.example.com',

  // Endpoints per model (optional, defaults to conventions)
  endpoints: {
    User: '/users',
    Post: '/posts',
  },

  // Headers
  headers: {
    'Authorization': 'Bearer TOKEN',
  },

  // Transform responses
  transformResponse: (data) => data,
});

class User extends Model {
  static adapter = adapter;
}

// Maps to:
// GET /users          -> User.objects.all()
// GET /users/:id      -> User.objects.get({id})
// POST /users         -> User.objects.create()
// PUT /users/:id      -> instance.save()
// DELETE /users/:id   -> instance.delete()
```

## Creating Custom Adapters

### Basic Template

```typescript
import { BackendAdapter, QueryPlan, ModelClass } from 'orm-js';

export class MyAdapter implements BackendAdapter {
  constructor(private config: MyAdapterConfig) {}

  async connect(): Promise<void> {
    // Initialize connection
  }

  async disconnect(): Promise<void> {
    // Clean up
  }

  async create<T>(
    model: ModelClass<T>,
    data: Partial<T>
  ): Promise<T> {
    // Implement create logic
    const result = await this.backend.insert(data);
    return this.hydrate(model, result);
  }

  async get<T>(
    model: ModelClass<T>,
    filters: QueryFilters
  ): Promise<T | null> {
    const plan: QueryPlan = {
      model,
      filters: this.compileFilters(filters),
      excludes: [],
      ordering: [],
      limit: 1,
    };

    const results = await this.filter(model, plan);
    return results[0] || null;
  }

  async filter<T>(
    model: ModelClass<T>,
    query: QueryPlan
  ): Promise<T[]> {
    // Convert QueryPlan to backend-specific query
    const backendQuery = this.translateQueryPlan(query);

    // Execute
    const results = await this.backend.query(backendQuery);

    // Hydrate to model instances
    return results.map(row => this.hydrate(model, row));
  }

  async update<T>(
    model: ModelClass<T>,
    id: any,
    data: Partial<T>
  ): Promise<T> {
    const result = await this.backend.update(id, data);
    return this.hydrate(model, result);
  }

  async delete<T>(
    model: ModelClass<T>,
    id: any
  ): Promise<void> {
    await this.backend.delete(id);
  }

  async count<T>(
    model: ModelClass<T>,
    query: QueryPlan
  ): Promise<number> {
    const backendQuery = this.translateQueryPlan(query);
    return await this.backend.count(backendQuery);
  }

  async exists<T>(
    model: ModelClass<T>,
    query: QueryPlan
  ): Promise<boolean> {
    return (await this.count(model, query)) > 0;
  }

  async resolveRelation<T, R>(
    instance: T,
    field: RelationField<R>
  ): Promise<R | R[]> {
    // Resolve foreign key or M2M
    if (field instanceof ForeignKey) {
      const foreignId = instance[field.name + '_id'];
      return await this.get(field.relatedModel, { id: foreignId });
    }

    // ... handle other relation types
  }

  // Helper: convert ORM data to model instances
  private hydrate<T>(model: ModelClass<T>, data: any): T {
    const instance = new model();
    Object.assign(instance, data);
    return instance;
  }

  // Helper: translate QueryPlan to backend-specific query
  private translateQueryPlan(plan: QueryPlan): any {
    // Implement based on your backend
  }
}
```

### Example: Redis Adapter

```typescript
import { BackendAdapter, QueryPlan, ModelClass } from 'orm-js';
import Redis from 'ioredis';

export class RedisAdapter implements BackendAdapter {
  private client: Redis;

  constructor(config: { host: string; port: number }) {
    this.client = new Redis(config);
  }

  async connect(): Promise<void> {
    // Redis connects automatically
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }

  async create<T>(model: ModelClass<T>, data: Partial<T>): Promise<T> {
    // Generate ID
    const id = await this.client.incr(`${model.name}:id`);
    const record = { ...data, id };

    // Store as hash
    const key = `${model.name}:${id}`;
    await this.client.hset(key, record);

    // Add to index
    await this.client.sadd(`${model.name}:all`, id);

    return this.hydrate(model, record);
  }

  async get<T>(
    model: ModelClass<T>,
    filters: QueryFilters
  ): Promise<T | null> {
    if (filters.id) {
      const key = `${model.name}:${filters.id}`;
      const data = await this.client.hgetall(key);

      if (Object.keys(data).length === 0) {
        return null;
      }

      return this.hydrate(model, data);
    }

    // For other filters, fall back to scanning (inefficient)
    const results = await this.filter(model, {
      model,
      filters: this.compileFilters(filters),
      excludes: [],
      ordering: [],
      limit: 1,
    });

    return results[0] || null;
  }

  async filter<T>(model: ModelClass<T>, query: QueryPlan): Promise<T[]> {
    // Get all IDs
    const ids = await this.client.smembers(`${model.name}:all`);

    // Fetch all records
    const records = await Promise.all(
      ids.map(async id => {
        const data = await this.client.hgetall(`${model.name}:${id}`);
        return data;
      })
    );

    // Filter in memory (Redis doesn't have complex queries)
    let filtered = this.applyFilters(records, query.filters);
    filtered = this.applyExcludes(filtered, query.excludes);
    filtered = this.applyOrdering(filtered, query.ordering);

    if (query.limit) {
      filtered = filtered.slice(query.offset || 0, query.limit);
    }

    return filtered.map(data => this.hydrate(model, data));
  }

  async update<T>(
    model: ModelClass<T>,
    id: any,
    data: Partial<T>
  ): Promise<T> {
    const key = `${model.name}:${id}`;
    await this.client.hset(key, data);

    const updated = await this.client.hgetall(key);
    return this.hydrate(model, updated);
  }

  async delete<T>(model: ModelClass<T>, id: any): Promise<void> {
    const key = `${model.name}:${id}`;
    await this.client.del(key);
    await this.client.srem(`${model.name}:all`, id);
  }

  async count<T>(model: ModelClass<T>, query: QueryPlan): Promise<number> {
    const results = await this.filter(model, query);
    return results.length;
  }

  async exists<T>(model: ModelClass<T>, query: QueryPlan): Promise<boolean> {
    return (await this.count(model, query)) > 0;
  }

  async resolveRelation<T, R>(
    instance: T,
    field: RelationField<R>
  ): Promise<R | R[]> {
    // Simple foreign key resolution
    if (field instanceof ForeignKey) {
      const foreignId = instance[field.name + '_id'];
      return await this.get(field.relatedModel, { id: foreignId });
    }

    throw new Error('Only ForeignKey supported in RedisAdapter');
  }

  // Helper methods
  private hydrate<T>(model: ModelClass<T>, data: any): T {
    const instance = new model();
    Object.assign(instance, data);
    return instance;
  }

  private compileFilters(filters: QueryFilters): CompiledFilter[] {
    // Convert {field: value} to internal format
    return Object.entries(filters).map(([key, value]) => ({
      field: key,
      lookup: 'exact',
      value,
    }));
  }

  private applyFilters(records: any[], filters: CompiledFilter[]): any[] {
    return records.filter(record => {
      return filters.every(filter => {
        const recordValue = record[filter.field];

        switch (filter.lookup) {
          case 'exact':
            return recordValue === filter.value;
          case 'gt':
            return recordValue > filter.value;
          // ... implement other lookups
          default:
            return true;
        }
      });
    });
  }

  private applyExcludes(records: any[], excludes: CompiledFilter[]): any[] {
    // Similar to applyFilters but inverted
    return records;
  }

  private applyOrdering(records: any[], ordering: string[]): any[] {
    // Sort by fields
    return records;
  }
}
```

## Adapter Interface

Complete interface definition:

```typescript
interface BackendAdapter {
  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  // CRUD operations
  create<T>(model: ModelClass<T>, data: Partial<T>): Promise<T>;
  get<T>(model: ModelClass<T>, filters: QueryFilters): Promise<T | null>;
  filter<T>(model: ModelClass<T>, query: QueryPlan): Promise<T[]>;
  update<T>(model: ModelClass<T>, id: any, data: Partial<T>): Promise<T>;
  delete<T>(model: ModelClass<T>, id: any): Promise<void>;

  // Query operations
  count<T>(model: ModelClass<T>, query: QueryPlan): Promise<number>;
  exists<T>(model: ModelClass<T>, query: QueryPlan): Promise<boolean>;

  // Bulk operations
  bulkCreate<T>(model: ModelClass<T>, items: Partial<T>[]): Promise<T[]>;
  bulkUpdate<T>(model: ModelClass<T>, items: T[]): Promise<void>;
  bulkDelete<T>(model: ModelClass<T>, ids: any[]): Promise<void>;

  // Relationship resolution
  resolveRelation<T, R>(
    instance: T,
    field: RelationField<R>
  ): Promise<R | R[]>;

  // Transactions (optional)
  transaction?<T>(callback: () => Promise<T>): Promise<T>;
}
```

## QueryPlan

The `QueryPlan` is an intermediate representation of a query:

```typescript
interface QueryPlan {
  model: ModelClass;
  filters: CompiledFilter[];
  excludes: CompiledFilter[];
  ordering: OrderingClause[];
  limit?: number;
  offset?: number;
  selectRelated: RelationPath[];
  prefetchRelated: RelationPath[];

  // Field selection for query optimization
  only?: string[];        // Only fetch these fields
  defer?: string[];       // Fetch all fields except these
}

interface CompiledFilter {
  field: string;
  lookup: LookupType;
  value: any;
  path?: string[];  // For relationships: ['author', 'name']
}

type LookupType =
  | 'exact'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'contains'
  | 'startswith' | 'endswith'
  | 'isnull' | 'range';

interface OrderingClause {
  field: string;
  direction: 'ASC' | 'DESC';
}

interface RelationPath {
  path: string[];  // ['author', 'publisher']
}
```

### Example QueryPlan

For this query:

```typescript
Book.objects
  .filter({ author__name__startswith: 'J' })
  .exclude({ pages__lt: 100 })
  .select_related('author')
  .order_by('-created_at')
  .limit(10);
```

The QueryPlan would be:

```typescript
{
  model: Book,
  filters: [
    {
      field: 'name',
      lookup: 'startswith',
      value: 'J',
      path: ['author'],
    },
  ],
  excludes: [
    {
      field: 'pages',
      lookup: 'lt',
      value: 100,
    },
  ],
  ordering: [
    { field: 'created_at', direction: 'DESC' },
  ],
  limit: 10,
  selectRelated: [
    { path: ['author'] },
  ],
  prefetchRelated: [],
  only: undefined,      // Fetch all fields
  defer: undefined,
}
```

### Field Selection in Adapters

Adapters should use `only` and `defer` to optimize queries by fetching only needed fields.

**GraphQL Example:**

```typescript
class GraphQLAdapter implements BackendAdapter {
  async filter<T>(model: ModelClass<T>, query: QueryPlan): Promise<T[]> {
    // Determine which fields to fetch
    const fields = this.getFieldsToFetch(model, query);

    // Build GraphQL query with only those fields
    const gqlQuery = gql`
      query {
        ${this.getQueryName(model)} {
          ${fields.join('\n')}
        }
      }
    `;

    const result = await this.client.query({ query: gqlQuery });
    return result.data.map(row => this.hydrate(model, row));
  }

  private getFieldsToFetch(model: ModelClass, query: QueryPlan): string[] {
    const allFields = Array.from(model.meta.fields.keys());

    if (query.only) {
      // Only fetch specified fields (plus id)
      return ['id', ...query.only];
    }

    if (query.defer) {
      // Fetch all fields except deferred ones
      return allFields.filter(f => !query.defer!.includes(f));
    }

    // Fetch all fields
    return allFields;
  }
}
```

**SQL Example:**

```typescript
class SQLAdapter implements BackendAdapter {
  async filter<T>(model: ModelClass<T>, query: QueryPlan): Promise<T[]> {
    // Build SELECT clause
    const fields = this.getFieldsToFetch(model, query);
    const selectClause = fields.map(f => `"${f}"`).join(', ');

    // Build full query
    const sql = `
      SELECT ${selectClause}
      FROM ${model.meta.tableName}
      WHERE ${this.buildWhereClause(query.filters)}
      ORDER BY ${this.buildOrderClause(query.ordering)}
      LIMIT ${query.limit}
    `;

    const rows = await this.db.query(sql);
    return rows.map(row => this.hydrate(model, row));
  }

  private getFieldsToFetch(model: ModelClass, query: QueryPlan): string[] {
    const allFields = Array.from(model.meta.fields.keys());

    if (query.only) {
      return ['id', ...query.only];
    }

    if (query.defer) {
      return allFields.filter(f => !query.defer!.includes(f));
    }

    return allFields;
  }
}
```

**Usage:**

```typescript
// Fetch only specific fields (useful for large text fields)
const posts = await Post.objects
  .only('id', 'title', 'created_at')  // Skip 'content' field
  .all();

// GraphQL generates: { id, title, created_at }
// SQL generates: SELECT id, title, created_at FROM posts

// Defer specific fields
const posts = await Post.objects
  .defer('content', 'raw_html')  // Fetch everything except these
  .all();

// Combining with relationships
const books = await Book.objects
  .select_related('author')
  .only('title', 'author__name')  // Fetch Book.title and Author.name only
  .all();
```

## Cross-Adapter Relationships

Models can reference models from different adapters:

```typescript
// User in GraphQL
class User extends Model {
  static adapter = new GraphQLAdapter({ endpoint: '/graphql' });
  username = new CharField();
}

// Session in Memory
class Session extends Model {
  static adapter = new MemoryAdapter();

  token = new CharField();
  user = new ForeignKey(User, {
    crossAdapter: true,  // Required flag
    relatedName: 'sessions',
  });
}
```

### How It Works

When resolving a cross-adapter relationship:

1. Get the foreign key value from the source instance
2. Determine the target model's adapter
3. Use the target adapter to fetch the related object

```typescript
// In ForeignKey.resolve()
async resolve(instance: Model): Promise<T> {
  const foreignId = instance[this.name + '_id'];

  // Use related model's adapter, not source model's
  const adapter = this.relatedModel.adapter;

  return await adapter.get(this.relatedModel, { id: foreignId });
}
```

### Limitations

- Foreign key value must be compatible across adapters (e.g., both use integer IDs)
- No JOIN optimization (always lazy or requires separate queries)
- Transactions don't span adapters

## Best Practices

### 1. Implement Bulk Operations Efficiently

```typescript
// Bad: N queries
async bulkCreate<T>(model: ModelClass<T>, items: Partial<T>[]): Promise<T[]> {
  return await Promise.all(
    items.map(item => this.create(model, item))
  );
}

// Good: Single batch query
async bulkCreate<T>(model: ModelClass<T>, items: Partial<T>[]): Promise<T[]> {
  const results = await this.backend.batchInsert(items);
  return results.map(data => this.hydrate(model, data));
}
```

### 2. Handle Relationships Efficiently

For backends that support it, use JOINs or equivalent:

```typescript
async filter<T>(model: ModelClass<T>, query: QueryPlan): Promise<T[]> {
  let sqlQuery = `SELECT * FROM ${model.meta.tableName}`;

  // Handle select_related with JOINs
  for (const relation of query.selectRelated) {
    const field = model.meta.fields.get(relation.path[0]);
    sqlQuery += ` LEFT JOIN ${field.relatedModel.meta.tableName} ...`;
  }

  // ... execute query
}
```

### 3. Cache Metadata

```typescript
class MyAdapter implements BackendAdapter {
  private metadataCache = new Map<ModelClass, ModelMetadata>();

  private getMetadata<T>(model: ModelClass<T>): ModelMetadata {
    if (!this.metadataCache.has(model)) {
      this.metadataCache.set(model, this.buildMetadata(model));
    }
    return this.metadataCache.get(model)!;
  }
}
```

### 4. Validate Queries Before Sending

```typescript
async filter<T>(model: ModelClass<T>, query: QueryPlan): Promise<T[]> {
  // Validate fields exist
  for (const filter of query.filters) {
    if (!model.meta.fields.has(filter.field)) {
      throw new Error(`Unknown field: ${filter.field}`);
    }
  }

  // ... proceed with query
}
```

### 5. Provide Helpful Errors

```typescript
async get<T>(model: ModelClass<T>, filters: QueryFilters): Promise<T | null> {
  const results = await this.filter(model, {...});

  if (results.length > 1) {
    throw new MultipleObjectsReturned(
      `get() returned ${results.length} objects for ${model.name}`
    );
  }

  return results[0] || null;
}
```

### 6. Support Async Initialization

```typescript
class MyAdapter implements BackendAdapter {
  private ready: Promise<void>;

  constructor(config: Config) {
    this.ready = this.initialize(config);
  }

  private async initialize(config: Config): Promise<void> {
    await this.connectToBackend(config);
    await this.loadSchema();
  }

  async connect(): Promise<void> {
    await this.ready;
  }

  async create<T>(...): Promise<T> {
    await this.ready;  // Ensure initialized
    // ... proceed
  }
}
```

## Testing Adapters

```typescript
import { describe, it, expect } from 'vitest';
import { MyAdapter } from './MyAdapter';
import { Model, CharField } from 'orm-js';

describe('MyAdapter', () => {
  let adapter: MyAdapter;

  beforeEach(async () => {
    adapter = new MyAdapter({ ... });
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  it('should create records', async () => {
    class User extends Model {
      static adapter = adapter;
      name = new CharField();
    }

    const user = await User.objects.create({ name: 'John' });

    expect(user.id).toBeDefined();
    expect(user.name).toBe('John');
  });

  it('should filter records', async () => {
    // ... test filtering logic
  });

  it('should resolve relationships', async () => {
    // ... test relationship resolution
  });
});
```

## Publishing Adapters

Create adapters as separate npm packages:

```
@orm-js/adapter-{name}/
├── src/
│   └── index.ts
├── package.json
└── README.md
```

**package.json:**
```json
{
  "name": "@orm-js/adapter-postgres",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "peerDependencies": {
    "orm-js": "^1.0.0"
  },
  "dependencies": {
    "pg": "^8.0.0"
  }
}
```

This allows users to install only the adapters they need.
