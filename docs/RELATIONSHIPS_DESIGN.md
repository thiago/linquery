# Relationships Design Document

## Overview

Design document for implementing Django-style relationships in Linquery ORM.

## Goals

1. Support ForeignKey, OneToOneField, and ManyToManyField
2. Lazy loading by default (N+1 query problem awareness)
3. Eager loading via `select_related` and `prefetch_related`
4. Reverse relations (accessing related objects from "other side")
5. Type-safe API with full TypeScript support
6. Works across different adapters

## Use Cases

### Example Models

```typescript
class Author extends Model {
  declare id?: number;
  declare name: string;
  declare email: string;
  // Reverse relation (books is added automatically)
  declare books?: Book[];
}

Author.init({
  name: new CharField({ maxLength: 100 }),
  email: new CharField({ maxLength: 255 }),
});

class Book extends Model {
  declare id?: number;
  declare title: string;
  declare author: Author;  // ForeignKey
  declare pages: number;
}

Book.init({
  title: new CharField({ maxLength: 200 }),
  author: new ForeignKeyField(Author, { onDelete: 'CASCADE' }),
  pages: new IntegerField(),
});
```

### Basic Usage

```typescript
// Create with relationship
const author = await Author.objects.create({
  name: 'John Doe',
  email: 'john@example.com'
});

const book = await Book.objects.create({
  title: 'TypeScript Guide',
  author: author,  // Can pass instance
  pages: 300,
});

// Or with ID
const book2 = await Book.objects.create({
  title: 'JavaScript Basics',
  author_id: author.id,  // Can pass ID
  pages: 250,
});

// Lazy loading (triggers separate query)
const book = await Book.objects.get({ id: 1 });
const author = await book.author;  // Separate query
console.log(author.name);

// Eager loading (JOIN)
const book = await Book.objects
  .select_related('author')
  .get({ id: 1 });
console.log(book.author.name);  // No extra query!

// Reverse relation
const author = await Author.objects.get({ id: 1 });
const books = await author.books.all();  // Returns QuerySet
```

## Architecture

### 1. ForeignKeyField

#### Storage Format

```typescript
// In database/storage:
{
  id: 1,
  title: 'TypeScript Guide',
  author_id: 5,  // Foreign key column
  pages: 300
}

// In memory (Model instance):
{
  id: 1,
  title: 'TypeScript Guide',
  author_id: 5,           // Underlying ID
  _author: null,          // Cached instance (lazy loaded)
  pages: 300
}
```

#### Field Definition

```typescript
export class ForeignKeyField<T> extends Field<T> {
  private relatedModel: ModelClass<T>;
  private relatedName?: string;
  private onDelete: 'CASCADE' | 'SET_NULL' | 'PROTECT' | 'DO_NOTHING';

  constructor(relatedModel: ModelClass<T>, options?: ForeignKeyOptions) {
    super(options);
    this.relatedModel = relatedModel;
    this.relatedName = options?.relatedName;
    this.onDelete = options?.onDelete ?? 'CASCADE';
  }

  // Convert from DB (just store ID)
  fromDB(value: unknown): number | null {
    return value as number | null;
  }

  // Convert to DB (extract ID if instance)
  toDB(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return value;
    if (typeof value === 'object' && 'id' in value) {
      return (value as any).id;
    }
    return null;
  }
}
```

#### Property Descriptor

```typescript
// In Model.init(), for each ForeignKeyField:
Object.defineProperty(modelPrototype, fieldName, {
  get(): Promise<T> | T | null {
    const idField = `${fieldName}_id`;
    const cacheField = `_${fieldName}`;

    // If already loaded, return cached instance
    if (this[cacheField] !== undefined) {
      return this[cacheField];
    }

    // If no ID, return null
    const id = this[idField];
    if (!id) return null;

    // Lazy load: return Promise
    return field.relatedModel.objects.get({ id });
  },

  set(value: T | number | null) {
    const idField = `${fieldName}_id`;
    const cacheField = `_${fieldName}`;

    if (value === null || value === undefined) {
      this[idField] = null;
      this[cacheField] = null;
    } else if (typeof value === 'number') {
      this[idField] = value;
      this[cacheField] = undefined;  // Clear cache
    } else {
      // Instance provided
      this[idField] = (value as any).id;
      this[cacheField] = value;  // Cache the instance
    }
  }
});
```

### 2. Reverse Relations

Automatically add reverse relation to related model:

```typescript
// In Author model, automatically add:
Object.defineProperty(Author.prototype, 'books', {
  get() {
    if (!this.id) {
      throw new Error('Cannot access reverse relation on unsaved instance');
    }
    // Return a filtered QuerySet
    return Book.objects.filter({ author_id: this.id });
  }
});
```

### 3. select_related (Eager Loading)

```typescript
// QuerySet modification:
class QuerySet<T> {
  private selectRelatedFields: string[] = [];

  select_related(...fields: string[]): QuerySet<T> {
    const qs = this.clone();
    qs.selectRelatedFields.push(...fields);
    return qs;
  }

  // In execute():
  private async execute(): Promise<T[]> {
    // Build query plan with joins
    const plan = this.buildQueryPlan();

    if (this.selectRelatedFields.length > 0) {
      // Tell adapter to perform JOINs
      const results = await this.adapter.findWithRelated(
        this.model,
        plan,
        this.selectRelatedFields
      );

      // Pre-populate cached instances
      return results.map(row => {
        const instance = this.model.fromDB(row);

        // For each selected relation, populate cache
        for (const field of this.selectRelatedFields) {
          const relatedData = row[`${field}__data`];
          if (relatedData) {
            const relatedModel = getRelatedModel(this.model, field);
            instance[`_${field}`] = relatedModel.fromDB(relatedData);
          }
        }

        return instance;
      });
    }

    // Normal query without joins
    return this.adapter.find(this.model, this.buildQueryPlan());
  }
}
```

### 4. OneToOneField

Similar to ForeignKey but with unique constraint:

```typescript
export class OneToOneField<T> extends ForeignKeyField<T> {
  constructor(relatedModel: ModelClass<T>, options?: OneToOneOptions) {
    super(relatedModel, { ...options, unique: true });
  }
}
```

Reverse relation returns single instance instead of QuerySet:

```typescript
// In related model:
Object.defineProperty(User.prototype, 'profile', {
  get() {
    return Profile.objects.get({ user_id: this.id });
  }
});
```

### 5. ManyToManyField

Requires through table:

```typescript
class Book extends Model {
  declare tags: ManyToManyRelation<Tag>;
}

Book.init({
  title: new CharField({ maxLength: 200 }),
  tags: new ManyToManyField(Tag),  // Auto-creates BookTag through model
});

// Usage:
const book = await Book.objects.get({ id: 1 });
await book.tags.add(tag1, tag2);
await book.tags.remove(tag1);
await book.tags.clear();
const allTags = await book.tags.all();
```

Through table structure:

```typescript
// Auto-generated BookTag model:
class BookTag extends Model {
  book_id: number;
  tag_id: number;
}
```

### 6. prefetch_related

For reverse ForeignKey and ManyToMany:

```typescript
// Instead of:
const authors = await Author.objects.all();
for (const author of authors) {
  const books = await author.books.all();  // N+1 queries!
}

// Use prefetch:
const authors = await Author.objects
  .prefetch_related('books')
  .all();

for (const author of authors) {
  const books = await author.books.all();  // Already loaded!
}
```

Implementation:
1. Execute main query
2. Collect all IDs
3. Execute separate query: `SELECT * FROM books WHERE author_id IN (1, 2, 3...)`
4. Group results by foreign key
5. Populate caches

## Type System

### Type-safe field access:

```typescript
// ForeignKey field type
type ForeignKey<T> = T extends Model ? T : never;

// Reverse relation type
type ReverseRelation<T> = T extends Model ? QuerySet<T> : never;

// Model with relationships:
class Book extends Model {
  declare id?: number;
  declare title: string;
  declare author: Author;  // Type is Author, not Author | Promise<Author>
}

// TypeScript knows author is Author type
const book = await Book.objects.select_related('author').get({ id: 1 });
console.log(book.author.name);  // No error!
```

## Implementation Phases

### Phase 3.1: ForeignKey ✅ COMPLETED
- [x] Design architecture
- [x] Implement ForeignKeyField
- [x] Add property descriptors for lazy loading
- [x] Update Model.init() to handle foreign keys
- [x] Basic tests (7 tests passing)

### Phase 3.2: Eager Loading ✅ COMPLETED
- [x] Implement select_related
- [x] Batch loading with __in lookup
- [x] Implement in MemoryAdapter
- [x] Tests for eager loading (5 tests passing)

### Phase 3.3: Reverse Relations ✅ COMPLETED
- [x] Auto-generate reverse relations
- [x] Handle relatedName option
- [x] Tests for reverse relations (7 tests passing)

### Phase 3.4: OneToOne ✅ COMPLETED
- [x] Implement OneToOneField
- [x] Unique constraint
- [x] Reverse relation (single instance)
- [x] Tests (6 tests passing)

### Phase 3.5: ManyToMany ⏳ PARTIAL
- [x] Basic ManyToManyField placeholder
- [ ] Auto-generate through models (TODO)
- [ ] add(), remove(), clear(), set() methods (TODO)
- [ ] prefetch_related implementation (Structure in place)
- [ ] Tests (TODO)

**Total Tests**: 107 passing (34 unit + 73 integration including 25 relationship tests)

## Challenges & Solutions

### Challenge 1: Lazy Loading Returns Promise

**Problem:** `book.author` needs to return both cached value and promise.

**Solution:** Use TypeScript's type system:
```typescript
// In type definitions, treat as if it's always loaded:
declare author: Author;

// At runtime, getter returns Promise if not loaded:
get author(): Author | Promise<Author> {
  // ...
}
```

Developers must use `await` if not sure:
```typescript
const author = await book.author;  // Safe
```

Or check if eager loaded:
```typescript
if (book._author) {
  console.log(book.author.name);  // No await needed
}
```

### Challenge 2: Circular Dependencies

**Problem:** Author → Book → Author creates circular import.

**Solution:** Use string references and late binding:
```typescript
new ForeignKeyField('Author', { ... })  // String reference

// Resolved at runtime:
getRelatedModel(modelName: string): ModelClass {
  return ModelRegistry.get(modelName);
}
```

### Challenge 3: Cross-Adapter Relations

**Problem:** Book on MemoryAdapter, Author on RESTAdapter.

**Solution:**
- Each model knows its adapter
- Relationship traversal uses the target model's adapter
- QuerySet uses appropriate adapter for related queries

### Challenge 4: Type Safety with select_related

**Problem:** TypeScript doesn't know if relation is loaded.

**Solution:** Advanced conditional types:
```typescript
type SelectRelated<T, Fields extends string> = T & {
  [K in Fields]: K extends keyof T ? Awaited<T[K]> : never
};

// Usage:
const book: SelectRelated<Book, 'author'> =
  await Book.objects.select_related('author').get({ id: 1 });

book.author.name;  // TypeScript knows author is loaded
```

## Testing Strategy

1. **Unit Tests:**
   - ForeignKeyField serialization
   - Property descriptor behavior
   - Lazy loading logic

2. **Integration Tests:**
   - Create with foreign key
   - Lazy loading
   - Eager loading (select_related)
   - Reverse relations
   - Cascade delete
   - ManyToMany operations

3. **Type Tests:**
   - Relationship field types
   - select_related type inference
   - Reverse relation types

## Next Steps

1. ✅ Complete design document
2. Implement ForeignKeyField base class
3. Update Model.init() for relationship handling
4. Implement lazy loading with property descriptors
5. Add select_related to QuerySet
6. Write comprehensive tests
7. Update documentation

---

**Status:** Design phase complete, ready for implementation
**Estimated time:** 2-3 weeks for full implementation
**Risk level:** Medium (complex feature, needs careful testing)
