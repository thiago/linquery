# TypeScript Type Safety

Complete guide to type safety and autocomplete in ORM.js.

## Table of Contents

- [Overview](#overview)
- [Basic Type Inference](#basic-type-inference)
- [Field Names Autocomplete](#field-names-autocomplete)
- [Filter Lookups](#filter-lookups)
- [QuerySet Return Types](#queryset-return-types)
- [Relationship Types](#relationship-types)
- [Advanced Type Patterns](#advanced-type-patterns)
- [Implementation Details](#implementation-details)

## Overview

ORM.js is designed to be **strongly typed** with full TypeScript autocomplete support. You should get autocomplete for:

- Field names in `filter()`, `values()`, `order_by()`, etc.
- Field lookups (`__gte`, `__contains`, etc.)
- Related field names (`author__name`)
- Model instance properties
- Return types based on operations

## Basic Type Inference

### Model Definition with Type Inference

```typescript
class User extends Model {
  declare id?: number;
  declare name: string;
  declare email: string;
  declare age?: number;
  declare isActive: boolean;

  static objects: Manager<User>;
}

User.init({
  name: new CharField({ maxLength: 100 }),
  email: new CharField({ maxLength: 255 }),
  age: new IntegerField({ required: false }),
  isActive: new BooleanField({ default: true }),
});

// TypeScript automatically infers:
const user = await User.objects.first();

user?.name;      // Type: string
user?.email;     // Type: string
user?.age;       // Type: number | undefined (optional field)
user?.isActive;  // Type: boolean
user?.foo;       // ❌ Error: Property 'foo' does not exist
```

### How It Works

```typescript
// Simplified internal implementation
type InferFieldType<F> =
  F extends CharField ? string :
  F extends IntegerField ? number :
  F extends BooleanField ? boolean :
  F extends DateTimeField ? Date :
  unknown;

type ModelFields<T extends Model> = {
  [K in keyof T]: T[K] extends Field<infer U> ? U : T[K]
};

// User model automatically becomes:
type User = {
  id: number;
  name: string;
  email: string;
  age: number | undefined;
  isActive: boolean;
}
```

## Field Names Autocomplete

### Extract Field Names from Model

```typescript
// Type helper to extract field names
type FieldNames<T extends Model> = {
  [K in keyof T]: T[K] extends Field ? K : never
}[keyof T];

// For User model:
type UserFields = FieldNames<User>;
// Type: 'name' | 'email' | 'age' | 'isActive'
```

### values() with Autocomplete

```typescript
// Implementation
class QuerySet<T extends Model> {
  values<K extends FieldNames<T>>(...fields: K[]): QuerySet<Pick<T, K>> {
    // ...
  }
}

// Usage with autocomplete
const users = await User.objects.values('name', 'email');
//                                        ^       ^
//                                   Autocomplete works!

users[0].name;   // ✅ Type: string
users[0].email;  // ✅ Type: string
users[0].age;    // ❌ Error: Property 'age' does not exist
```

**User Experience:**

```typescript
User.objects.values(
  'n|'  // <- Cursor here, autocomplete shows: name
)

User.objects.values('name',
  'e|'  // <- Autocomplete shows: email
)

User.objects.values('foo')  // ❌ Error: Argument not assignable
```

### only() and defer()

```typescript
class QuerySet<T extends Model> {
  only<K extends FieldNames<T>>(...fields: K[]): QuerySet<Pick<T, K>> {
    // ...
  }

  defer<K extends FieldNames<T>>(...fields: K[]): QuerySet<Omit<T, K>> {
    // ...
  }
}

// Usage
const users = await User.objects.only('name', 'email').all();
//                                        ^       ^
//                                   Autocomplete!

users[0].name;   // ✅ Available
users[0].age;    // ❌ Error: Property 'age' does not exist (deferred)

// Defer
const users2 = await User.objects.defer('age').all();
users2[0].name;   // ✅ Available
users2[0].age;    // ❌ Not available (deferred)
```

### order_by() with Autocomplete

```typescript
// Support ordering with '-' prefix for descending
type OrderingField<T extends Model> =
  | FieldNames<T>
  | `-${FieldNames<T>}`;

class QuerySet<T extends Model> {
  order_by(...fields: OrderingField<T>[]): QuerySet<T> {
    // ...
  }
}

// Usage
User.objects.order_by('name', '-age');
//                      ^       ^
//                 Autocomplete works!

User.objects.order_by('-email');  // ✅
User.objects.order_by('foo');     // ❌ Error
User.objects.order_by('-foo');    // ❌ Error
```

## Filter Lookups

### Field Lookups with Types

```typescript
// Define lookup types per field type
type StringLookups =
  | 'exact' | 'iexact'
  | 'contains' | 'icontains'
  | 'startswith' | 'istartswith'
  | 'endswith' | 'iendswith'
  | 'in' | 'isnull';

type NumberLookups =
  | 'exact' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'range' | 'isnull';

type DateLookups =
  | 'exact' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'year' | 'month' | 'day'
  | 'isnull';

// Map field type to allowed lookups
type FieldLookups<F> =
  F extends CharField ? StringLookups :
  F extends TextField ? StringLookups :
  F extends IntegerField ? NumberLookups :
  F extends FloatField ? NumberLookups :
  F extends DateTimeField ? DateLookups :
  F extends DateField ? DateLookups :
  never;
```

### filter() with Lookup Autocomplete

```typescript
// Build filter keys with lookups
type FilterKey<T extends Model> = {
  [K in FieldNames<T>]:
    | K  // Plain field name
    | `${K}__${FieldLookups<T[K]>}`  // Field with lookup
}[FieldNames<T>];

// For User model:
type UserFilterKey = FilterKey<User>;
// Type: 'name' | 'name__exact' | 'name__contains' | ...
//       'email' | 'email__exact' | ...
//       'age' | 'age__gt' | 'age__gte' | ...

// Filter type
type FilterType<T extends Model> = {
  [K in FilterKey<T>]?: any;  // TODO: Type the value based on lookup
};

class QuerySet<T extends Model> {
  filter(filters: FilterType<T>): QuerySet<T> {
    // ...
  }
}

// Usage with autocomplete
User.objects.filter({
  name|  // <- Autocomplete shows all name__ lookups
})

User.objects.filter({
  name__contains: 'John',
  age__gte: 18,
  email__iexact: 'test@example.com',
});

User.objects.filter({
  name__gt: 'foo'  // ❌ Error: 'gt' not valid for CharField
});
```

### Type-Safe Filter Values

```typescript
// Extract value type based on field and lookup
type FilterValue<T extends Model, K extends string> =
  K extends `${infer Field}__${infer Lookup}` ?
    Field extends FieldNames<T> ?
      Lookup extends 'in' ? T[Field][] :
      Lookup extends 'range' ? [T[Field], T[Field]] :
      Lookup extends 'isnull' ? boolean :
      T[Field]
    : never
  : K extends FieldNames<T> ? T[K] : never;

// Better filter type
type FilterType<T extends Model> = {
  [K in FilterKey<T>]?: FilterValue<T, K>;
};

// Usage
User.objects.filter({
  age__gte: 18,        // ✅ Type: number
  age__gte: 'invalid', // ❌ Error: Type 'string' not assignable to 'number'

  name__in: ['Alice', 'Bob'],  // ✅ Type: string[]
  name__in: [1, 2],            // ❌ Error: Type 'number' not assignable

  age__range: [18, 65],  // ✅ Type: [number, number]
  age__range: [18],      // ❌ Error: Wrong tuple length
});
```

## QuerySet Return Types

### Conditional Return Types

```typescript
class QuerySet<T extends Model, Loaded extends string = never> {
  // all() returns array
  async all(): Promise<T[]> {
    // ...
  }

  // first() returns single instance or null
  async first(): Promise<T | null> {
    // ...
  }

  // get() returns single instance (throws if not found)
  async get(filters?: FilterType<T>): Promise<T> {
    // ...
  }

  // count() returns number
  async count(): Promise<number> {
    // ...
  }

  // exists() returns boolean
  async exists(): Promise<boolean> {
    // ...
  }

  // values() returns plain objects
  values<K extends FieldNames<T>>(
    ...fields: K[]
  ): QuerySet<Pick<T, K>, Loaded> {
    // ...
  }

  // values_list() returns tuples
  values_list<K extends FieldNames<T>>(
    ...fields: K[]
  ): ValuesList<T, K> {
    // ...
  }
}

// ValuesList type
type ValuesList<T extends Model, K extends FieldNames<T>> = {
  all(): Promise<[T[K], ...any[]][]>;

  // With flat option
  all(options: { flat: true }): Promise<T[K][]>;
};

// Usage
const users = await User.objects.all();
// Type: User[]

const user = await User.objects.first();
// Type: User | null

const count = await User.objects.count();
// Type: number

const names = await User.objects.values('name').all();
// Type: { name: string }[]

const nameTuples = await User.objects.values_list('name', 'age').all();
// Type: [string, number | undefined][]

const flatNames = await User.objects.values_list('name', { flat: true }).all();
// Type: string[]
```

## Relationship Types

### ForeignKey Typing

**Note:** Relationship fields are planned for future implementation.

```typescript
class Post extends Model {
  declare id?: number;
  declare title: string;
  declare author: User;

  static objects: Manager<Post>;
}

Post.init({
  title: new CharField(),
  author: new ForeignKey(User, { relatedName: 'posts' }),
});

// Without select_related: Promise
const post = await Post.objects.first();
const author = await post?.author;  // Type: Promise<User>
//              ^
//         Must await

// With select_related: Direct access
const post2 = await Post.objects.select_related('author').first();
post2?.author.name;  // Type: string (no Promise!)
```

### Conditional Relationship Types

```typescript
class QuerySet<T extends Model, Loaded extends string = never> {
  select_related<K extends RelationFieldNames<T>>(
    ...fields: K[]
  ): QuerySet<T, Loaded | K> {
    // Mark fields as loaded
  }
}

// Type helper for relationship access
type RelationAccess<T, Field extends string, Loaded extends string> =
  Field extends Loaded
    ? T  // Direct access if loaded
    : Promise<T>;  // Promise if not loaded

class ForeignKey<T extends Model> extends Field<T> {
  // Type changes based on whether it's loaded
  get(): RelationAccess<T, this.name, LoadedFields> {
    // ...
  }
}

// Usage
const post = await Post.objects.select_related('author').first();

// TypeScript knows 'author' is loaded
post.author;  // Type: User (not Promise<User>!)
```

### Relationship Field Names

```typescript
// Extract relationship field names
type RelationFieldNames<T extends Model> = {
  [K in keyof T]:
    T[K] extends ForeignKey<any> ? K :
    T[K] extends OneToOneField<any> ? K :
    never
}[keyof T];

type PostRelations = RelationFieldNames<Post>;
// Type: 'author'

// Spanning relationships
type SpanningPath<T extends Model> =
  | RelationFieldNames<T>
  | `${RelationFieldNames<T>}__${string}`;

// Usage
Post.objects.select_related('author');           // ✅
Post.objects.select_related('author__profile');  // ✅
Post.objects.select_related('foo');              // ❌ Error
```

### Related Field Filters

```typescript
// Allow filtering by related fields
type RelatedFilterKey<T extends Model> = {
  [K in RelationFieldNames<T>]:
    K extends keyof T ?
      T[K] extends ForeignKey<infer R> ?
        `${K}__${FieldNames<R>}` | `${K}__${FieldNames<R>}__${string}`
      : never
    : never
}[RelationFieldNames<T>];

// For Post model:
type PostFilterKey = FilterKey<Post> | RelatedFilterKey<Post>;
// Type: 'title' | 'title__contains' | ...
//       'author__name' | 'author__name__contains' | ...
//       'author__email' | ...

// Usage
Post.objects.filter({
  author__name: 'John',              // ✅
  author__name__contains: 'Doe',     // ✅
  author__age__gte: 18,              // ✅
  author__foo: 'bar',                // ❌ Error: Unknown field
});
```

## Advanced Type Patterns

### Generic Model Base

```typescript
// All models extend this base
class Model<Fields = {}> {
  // Infer fields from class properties
  [K: string]: any;
}

// Helper to extract instance type
type ModelInstance<T extends typeof Model> =
  T extends new () => infer I ? I : never;

// Usage
type UserInstance = ModelInstance<typeof User>;
// Same as: User
```

### Builder Pattern Types

```typescript
// QuerySet builder returns new type after each operation
class QuerySet<
  T extends Model,
  Selected extends string = FieldNames<T>,  // Selected fields
  Loaded extends string = never,             // Loaded relations
> {
  only<K extends FieldNames<T>>(
    ...fields: K[]
  ): QuerySet<T, K, Loaded> {
    // Changes Selected type
  }

  select_related<K extends RelationFieldNames<T>>(
    ...fields: K[]
  ): QuerySet<T, Selected, Loaded | K> {
    // Adds to Loaded type
  }

  async all(): Promise<Pick<T, Selected>[]> {
    // Returns only selected fields
  }
}

// Usage
const result = await User.objects
  .only('name', 'email')
  .select_related('profile')
  .all();

// Type: Array<{ name: string, email: string }>
// And result[0].profile is User (not Promise)
```

### Async Iterator Types

```typescript
class QuerySet<T extends Model> {
  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    const results = await this.all();
    for (const item of results) {
      yield item;
    }
  }
}

// Usage with full type safety
for await (const user of User.objects.filter({ age__gte: 18 })) {
  console.log(user.name);  // Type: string
}
```

## Implementation Details

### Field Metadata with Types

```typescript
// Field base class with type parameter
abstract class Field<T = any> {
  required: boolean;
  default?: T | (() => T);

  abstract getType(): string;
  abstract validate(value: T): Promise<void>;

  // Type information for inference
  readonly __type!: T;
}

// CharField produces string
class CharField extends Field<string> {
  maxLength: number;

  getType() {
    return 'string';
  }
}

// IntegerField produces number
class IntegerField extends Field<number> {
  min?: number;
  max?: number;

  getType() {
    return 'number';
  }
}
```

### Model Metadata

```typescript
class ModelMeta<T extends Model> {
  fields: Map<string, Field>;
  relationships: Map<string, RelationField>;

  // Type helpers
  getFieldNames(): Array<FieldNames<T>> {
    return Array.from(this.fields.keys()) as Array<FieldNames<T>>;
  }

  getRelationNames(): Array<RelationFieldNames<T>> {
    return Array.from(this.relationships.keys()) as Array<RelationFieldNames<T>>;
  }
}

// Access at runtime
User.meta.getFieldNames();  // ['name', 'email', 'age', 'isActive']
User.meta.getRelationNames();  // []

Post.meta.getFieldNames();  // ['title', 'content']
Post.meta.getRelationNames();  // ['author']
```

### Runtime Validation

```typescript
// Validate field names at runtime
class QuerySet<T extends Model> {
  filter(filters: FilterType<T>): QuerySet<T> {
    // Runtime check
    Object.keys(filters).forEach(key => {
      const field = key.split('__')[0];
      if (!this.model.meta.fields.has(field)) {
        throw new InvalidQueryError(`Unknown field: ${field}`);
      }
    });

    // ...
  }
}
```

### Type Testing

```typescript
// Test types with type assertions
import { expectType } from 'tsd';

// Test field types
const user = await User.objects.first();
expectType<string>(user.name);
expectType<number | undefined>(user.age);

// Test filter autocomplete
User.objects.filter({
  name__contains: 'test',  // ✅
  // @ts-expect-error - Should error on invalid lookup
  name__foo: 'test',
});

// Test values() return type
const names = await User.objects.values('name').all();
expectType<Array<{ name: string }>>(names);

// Test relationship types
const post = await Post.objects.select_related('author').first();
expectType<User>(post.author);  // Not Promise<User>

const post2 = await Post.objects.first();
expectType<Promise<User>>(post2.author);  // Is Promise<User>
```

## Best Practices

1. **Always use TypeScript strict mode**
   ```json
   {
     "compilerOptions": {
       "strict": true,
       "strictNullChecks": true
     }
   }
   ```

2. **Define models with explicit types**
   ```typescript
   // Good - type safety with declare
   class User extends Model {
     declare id?: number;
     declare name: string;

     static objects: Manager<User>;
   }

   User.init({
     name: new CharField({ maxLength: 100 }),
   });

   // Avoid - loses type information
   class BadUser extends Model {
     name: any;
   }
   ```

3. **Use const assertions for choices**
   ```typescript
   const USER_ROLES = ['admin', 'user', 'guest'] as const;

   class User extends Model {
     declare id?: number;
     declare role: 'admin' | 'user' | 'guest';

     static objects: Manager<User>;
   }

   User.init({
     role: new ChoiceField({ choices: USER_ROLES }),
   });

   // Type: 'admin' | 'user' | 'guest'
   ```

4. **Leverage type inference**
   ```typescript
   // Let TypeScript infer the type
   const user = await User.objects.first();

   // Don't need to specify
   const user: User = await User.objects.first();
   ```

5. **Test your types**
   ```typescript
   // Use tsd or expect-type to test types
   import { expectType } from 'tsd';

   expectType<string>(user.name);
   ```

## Summary

ORM.js provides complete type safety with:

- ✅ **Field name autocomplete** in all methods
- ✅ **Lookup autocomplete** (`__contains`, `__gte`, etc.)
- ✅ **Type-safe filter values** (can't pass string to number field)
- ✅ **Return type inference** (`.all()` vs `.first()` vs `.count()`)
- ✅ **Relationship type tracking** (Promise vs direct access)
- ✅ **Related field traversal** (`author__name`)
- ✅ **values() / values_list()** with correct return types

This makes it nearly impossible to write invalid queries at compile time!
