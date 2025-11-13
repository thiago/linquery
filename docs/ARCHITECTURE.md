# Architecture

This document describes the technical architecture of ORM.js.

## Table of Contents

- [Overview](#overview)
- [Core Components](#core-components)
- [Data Flow](#data-flow)
- [Adapter System](#adapter-system)
- [Type System](#type-system)
- [Design Decisions](#design-decisions)

## Overview

ORM.js is structured in layers, from high-level user API down to backend-specific adapters:

```
┌─────────────────────────────────────────────────┐
│                   User Code                      │
│  Define models, execute queries, handle results │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│              ORM Core Layer                      │
│  ┌──────────────────────────────────────────┐  │
│  │ Model: Base class for all models         │  │
│  │ - Field definitions                      │  │
│  │ - Lifecycle methods (save, delete, etc)  │  │
│  │ - Signal emission                        │  │
│  └──────────────────────────────────────────┘  │
│                                                  │
│  ┌──────────────────────────────────────────┐  │
│  │ QuerySet: Lazy query builder             │  │
│  │ - filter(), exclude(), order_by()        │  │
│  │ - select_related(), prefetch_related()   │  │
│  │ - Chainable API                          │  │
│  │ - Deferred execution                     │  │
│  └──────────────────────────────────────────┘  │
│                                                  │
│  ┌──────────────────────────────────────────┐  │
│  │ Manager: Entry point for queries         │  │
│  │ - Model.objects.all()                    │  │
│  │ - Model.objects.filter()                 │  │
│  │ - Creates QuerySets                      │  │
│  └──────────────────────────────────────────┘  │
│                                                  │
│  ┌──────────────────────────────────────────┐  │
│  │ Fields: Data type definitions            │  │
│  │ - CharField, IntegerField, etc.          │  │
│  │ - Validation logic                       │  │
│  │ - Serialization/deserialization          │  │
│  └──────────────────────────────────────────┘  │
│                                                  │
│  ┌──────────────────────────────────────────┐  │
│  │ Relations: ForeignKey, ManyToMany        │  │
│  │ - Lazy loading (default)                 │  │
│  │ - Eager loading (with select_related)    │  │
│  │ - Cross-adapter support                  │  │
│  └──────────────────────────────────────────┘  │
│                                                  │
│  ┌──────────────────────────────────────────┐  │
│  │ Signals: Event system                    │  │
│  │ - Pre/post save, delete, init            │  │
│  │ - Sync lifecycle events                  │  │
│  │ - Connect/disconnect handlers            │  │
│  └──────────────────────────────────────────┘  │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│          Backend Adapter Interface               │
│  Abstract interface all adapters implement       │
│  - CRUD operations                               │
│  - Query filtering                               │
│  - Relationship resolution                       │
└──────────────────┬──────────────────────────────┘
                   │
        ┌──────────┼──────────┬──────────┐
        │          │           │          │
   ┌────▼───┐ ┌───▼────┐ ┌───▼─────┐┌──▼──────┐
   │GraphQL │ │Memory  │ │Dexie    ││Sync     │
   │Adapter │ │Adapter │ │Adapter  ││Adapter  │
   └────────┘ └────────┘ └─────────┘└─┬───────┘
                                       │
                              ┌────────▼────────┐
                              │Wraps Local +    │
                              │Remote adapters  │
                              └─────────────────┘
```

## Core Components

### Model

The base class for all domain models. Users extend this to define their schemas.

**Responsibilities:**
- Field definition and validation
- CRUD operations (save, delete, refresh)
- Signal emission during lifecycle events
- Adapter coordination

**Key Methods:**
```typescript
class Model {
  static adapter: BackendAdapter;
  static objects: Manager<this>;

  // Instance methods
  async save(): Promise<this>;
  async delete(): Promise<void>;
  async refresh(): Promise<this>;

  // Validation
  async clean(): Promise<void>;
  async validate(): Promise<ValidationError[]>;

  // Serialization
  toJSON(): Record<string, any>;
  static fromJSON(data: any): this;
}
```

**Metadata Storage:**
Each model class maintains metadata about its fields:
```typescript
class ModelMeta {
  fields: Map<string, Field>;
  relationships: Map<string, RelationField>;
  tableName: string;
  ordering: string[];
}
```

### Field

Base class for all field types. Handles validation, serialization, and type coercion.

**Field Types:**
```typescript
// Basic fields
CharField({ maxLength, minLength, required, default })
TextField({ required, default })
IntegerField({ min, max, required, default })
FloatField({ min, max, required, default })
BooleanField({ required, default })
DateTimeField({ autoNow, autoNowAdd, required, default })
DateField({ required, default })
JSONField({ required, default })

// Relation fields
ForeignKey(relatedModel, { relatedName, onDelete, crossAdapter })
ManyToManyField(relatedModel, { relatedName, through })
OneToOneField(relatedModel, { relatedName, onDelete })
```

**Field Interface:**
```typescript
abstract class Field<T = any> {
  required: boolean;
  default?: T | (() => T);
  validators: Validator[];

  // Validation
  abstract validate(value: T): Promise<ValidationError[]>;

  // Serialization
  abstract toDB(value: T): any;
  abstract fromDB(value: any): T;

  // Type checking
  abstract getType(): string;
}
```

### QuerySet

Lazy query builder that constructs queries through method chaining.

**Key Properties:**
- **Immutable**: Each method returns a new QuerySet
- **Lazy**: No execution until terminal method called
- **Chainable**: Methods can be combined in any order

**Query Building:**
```typescript
class QuerySet<T extends Model> {
  private _filters: QueryFilter[] = [];
  private _excludes: QueryFilter[] = [];
  private _ordering: string[] = [];
  private _limit?: number;
  private _offset?: number;
  private _selectRelated: string[] = [];
  private _prefetchRelated: string[] = [];

  // Filtering
  filter(filters: QueryFilters): QuerySet<T>;
  exclude(filters: QueryFilters): QuerySet<T>;

  // Relationships
  select_related(...fields: string[]): QuerySet<T>;
  prefetch_related(...fields: string[]): QuerySet<T>;

  // Ordering
  order_by(...fields: string[]): QuerySet<T>;

  // Slicing
  limit(n: number): QuerySet<T>;
  offset(n: number): QuerySet<T>;

  // Terminal methods (execute query)
  async all(): Promise<T[]>;
  async first(): Promise<T | null>;
  async last(): Promise<T | null>;
  async get(filters?: QueryFilters): Promise<T>;
  async count(): Promise<number>;
  async exists(): Promise<boolean>;

  // Async iteration
  [Symbol.asyncIterator](): AsyncIterator<T>;
}
```

**Field Lookups:**
QuerySets support Django-style field lookups:
```typescript
{
  field: value,              // Exact match
  field__gt: value,          // Greater than
  field__gte: value,         // Greater than or equal
  field__lt: value,          // Less than
  field__lte: value,         // Less than or equal
  field__in: [v1, v2],      // In list
  field__contains: value,    // String contains
  field__startswith: value,  // String starts with
  field__endswith: value,    // String ends with
  field__isnull: true,      // Is null
  field__iexact: value,     // Case-insensitive exact

  // Relationship traversal
  author__name: 'John',
  author__age__gte: 30,
}
```

### Manager

Entry point for database queries. Every model has a `objects` manager by default.

```typescript
class Manager<T extends Model> {
  constructor(private modelClass: ModelClass<T>) {}

  // Returns new QuerySet
  all(): QuerySet<T>;
  filter(filters: QueryFilters): QuerySet<T>;
  exclude(filters: QueryFilters): QuerySet<T>;

  // Shortcuts (don't return QuerySet)
  async get(filters: QueryFilters): Promise<T>;
  async create(data: Partial<T>): Promise<T>;
  async update(filters: QueryFilters, data: Partial<T>): Promise<number>;
  async delete(filters: QueryFilters): Promise<number>;

  // Bulk operations
  async bulkCreate(items: Partial<T>[]): Promise<T[]>;
  async bulkUpdate(items: T[], fields: string[]): Promise<void>;
}
```

**Custom Managers:**
Users can define custom managers:
```typescript
class PublishedManager extends Manager<Article> {
  all() {
    return super.all().filter({ status: 'published' });
  }
}

class Article extends Model {
  declare id?: number;
  declare status: string;

  static objects = new Manager(Article);
  static published = new PublishedManager(Article);
}

Article.init({
  status: new CharField({ choices: ['draft', 'published'] }),
});

// Usage
await Article.published.all();  // Only published articles
```

### Relations

#### ForeignKey (Many-to-One)

```typescript
class ForeignKey<T extends Model> extends Field<T> {
  constructor(
    private relatedModel: ModelClass<T>,
    private options: {
      relatedName?: string;    // Reverse relation name
      onDelete?: 'CASCADE' | 'SET_NULL' | 'PROTECT';
      crossAdapter?: boolean;  // Allow different adapters
    }
  ) {}

  // Lazy loading by default
  async resolve(instance: Model): Promise<T> {
    const foreignId = instance[this.name + '_id'];
    const adapter = this.options.crossAdapter
      ? this.relatedModel.adapter
      : instance.constructor.adapter;

    return await adapter.get(this.relatedModel, { id: foreignId });
  }
}
```

**Usage:**
```typescript
class Book extends Model {
  declare id?: number;
  declare title: string;
  declare author: Author;

  static objects: Manager<Book>;
}

Book.init({
  title: new CharField({ maxLength: 200 }),
  author: new ForeignKey(Author, { relatedName: 'books' }),
});

const book = await Book.objects.get({ id: 1 });

// Lazy: requires await
const author = await book.author;

// Eager: with select_related
const book2 = await Book.objects
  .select_related('author')
  .get({ id: 1 });
book2.author.name;  // Synchronous access
```

#### ManyToManyField

```typescript
class ManyToManyField<T extends Model> extends Field<T[]> {
  constructor(
    private relatedModel: ModelClass<T>,
    private options: {
      relatedName?: string;
      through?: ModelClass;  // Custom through model
    }
  ) {}

  // Returns a manager for the related objects
  getManager(instance: Model): RelatedManager<T> {
    return new RelatedManager(instance, this.relatedModel, this);
  }
}
```

**Usage:**
```typescript
class Book extends Model {
  declare id?: number;
  declare title: string;
  declare tags: Tag[];

  static objects: Manager<Book>;
}

Book.init({
  title: new CharField({ maxLength: 200 }),
  tags: new ManyToManyField(Tag, { relatedName: 'books' }),
});

const book = await Book.objects.get({ id: 1 });

// Add/remove
await book.tags.add(tag1, tag2);
await book.tags.remove(tag1);

// Query
const tags = await book.tags.all();
const count = await book.tags.count();
```

### Signal System

Event-driven hooks into model lifecycle.

**Signal Types:**
```typescript
enum SignalType {
  // Model lifecycle
  PRE_INIT = 'pre_init',
  POST_INIT = 'post_init',
  PRE_SAVE = 'pre_save',
  POST_SAVE = 'post_save',
  PRE_DELETE = 'pre_delete',
  POST_DELETE = 'post_delete',
  M2M_CHANGED = 'm2m_changed',

  // Sync lifecycle
  PRE_SYNC = 'pre_sync',
  POST_SYNC = 'post_sync',
  SYNC_CONFLICT = 'sync_conflict',
}
```

**Implementation:**
```typescript
class Signal<T = any> {
  private handlers: Map<string, SignalHandler[]> = new Map();

  connect(
    handler: SignalHandler<T>,
    options?: { sender?: ModelClass }
  ): void;

  disconnect(handler: SignalHandler<T>): void;

  async send(sender: ModelClass, ...args: any[]): Promise<void>;
}

// Global signal registry
const signals = {
  [SignalType.PRE_SAVE]: new Signal(),
  [SignalType.POST_SAVE]: new Signal(),
  // ... etc
};

// Helper function
function signal(type: SignalType): Signal {
  return signals[type];
}
```

## Data Flow

### Query Execution Flow

```
1. User calls Model.objects.filter({...})
   ↓
2. Manager creates new QuerySet
   ↓
3. User chains more methods (lazy)
   ↓
4. User calls terminal method (.all())
   ↓
5. QuerySet compiles to QueryPlan
   ↓
6. QueryPlan sent to Adapter
   ↓
7. Adapter executes backend-specific query
   ↓
8. Adapter returns raw data
   ↓
9. QuerySet hydrates into Model instances
   ↓
10. Model instances returned to user
```

### Save Flow

```
1. User calls instance.save()
   ↓
2. Emit PRE_SAVE signal
   ↓
3. Run validation (instance.clean())
   ↓
4. Determine if INSERT or UPDATE
   ↓
5. Call adapter.create() or adapter.update()
   ↓
6. Update instance with returned data
   ↓
7. Emit POST_SAVE signal
   ↓
8. Return instance
```

### Relationship Resolution Flow

```
# Lazy Loading (default)
1. User accesses instance.foreignKey
   ↓
2. Check if already loaded
   ↓
3. If not, get foreign key value
   ↓
4. Determine adapter (cross-adapter support)
   ↓
5. Call adapter.get() with foreign key
   ↓
6. Hydrate and return related instance

# Eager Loading (select_related)
1. User calls .select_related('foreignKey')
   ↓
2. QuerySet marks field for eager loading
   ↓
3. When executing, QueryPlan includes JOIN
   ↓
4. Adapter returns data with related objects
   ↓
5. QuerySet hydrates both main and related models
   ↓
6. Related objects cached on instances
```

## Adapter System

### Interface

Every adapter must implement:

```typescript
interface BackendAdapter {
  // Connection
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  // CRUD
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

  // Relationships
  resolveRelation<T, R>(
    instance: T,
    field: RelationField<R>
  ): Promise<R | R[]>;

  // Transactions (optional, adapter-specific)
  transaction?<T>(callback: () => Promise<T>): Promise<T>;
}
```

### QueryPlan

Intermediate representation of a query, sent to adapters:

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
}

interface CompiledFilter {
  field: string;
  lookup: LookupType;
  value: any;
  path?: string[];  // For relationship traversal
}
```

## Type System

### Type Inference

Strong type inference throughout:

```typescript
class Book extends Model {
  declare id?: number;
  declare title: string;
  declare pages: number;

  static objects: Manager<Book>;
}

Book.init({
  title: new CharField(),
  pages: new IntegerField(),
});

// TypeScript infers:
const book = await Book.objects.first();
// book: Book | undefined

book?.title;  // string
book?.pages;  // number

// Relationships
class Author extends Model {
  declare id?: number;
  declare name: string;

  static objects: Manager<Author>;
}

Author.init({
  name: new CharField(),
});

class Book extends Model {
  declare id?: number;
  declare title: string;
  declare author: Author;

  static objects: Manager<Book>;
}

Book.init({
  title: new CharField(),
  author: new ForeignKey(Author),
});

const book = await Book.objects.select_related('author').first();
// book.author is Author (not Promise)

const book2 = await Book.objects.first();
// book2.author is Promise<Author> (lazy)
```

### Conditional Types for Relations

```typescript
type RelatedField<T extends Model, IsLoaded extends boolean = false> =
  IsLoaded extends true ? T : Promise<T>;

// QuerySet marks fields as loaded
interface QuerySetWithLoaded<T extends Model, Loaded extends string[]> {
  // Magic happens here to change Promise<X> to X for loaded fields
}
```

## Design Decisions

### 1. Lazy by Default

**Decision:** Relationships are lazy (Promise) by default, eager with `select_related()`.

**Rationale:**
- Matches Django behavior
- Prevents N+1 problems when users think about it
- Explicit performance optimization
- Cross-adapter relationships may be expensive

### 2. Immutable QuerySets

**Decision:** QuerySet methods return new instances.

**Rationale:**
- Predictable behavior
- Easy to compose queries
- No hidden state changes
- Enables query caching

### 3. Adapter per Model

**Decision:** Each model specifies its adapter via static property.

**Rationale:**
- Enables cross-adapter relationships
- Simple mental model
- No global state
- Easy to test (swap adapters)

### 4. Signal-Based Extensibility

**Decision:** Use signals rather than inheritance for hooks.

**Rationale:**
- Decoupled from model code
- Multiple listeners possible
- Can be added at runtime
- Matches Django pattern

### 5. Validation in Core

**Decision:** Validation logic lives in Field classes, not adapters.

**Rationale:**
- Consistent validation across adapters
- Client-side validation in browser
- Fail fast before network calls
- Adapters can add additional validation

### 6. TypeScript First

**Decision:** Written in TypeScript, compile to JS.

**Rationale:**
- Better DX
- Catch errors at compile time
- IDE autocomplete
- Self-documenting API
- Still usable from plain JS

## Next Steps

See [ROADMAP.md](./ROADMAP.md) for implementation phases.
