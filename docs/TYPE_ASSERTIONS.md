# Type Assertions in Linquery

This document explains the use of `as any` type assertions in the codebase and why they are necessary.

## Table of Contents

- [Overview](#overview)
- [The TypeScript Limitation](#the-typescript-limitation)
- [Where We Use Type Assertions](#where-we-use-type-assertions)
- [Why This Is Safe](#why-this-is-safe)
- [Alternatives Considered](#alternatives-considered)
- [Contributing Guidelines](#contributing-guidelines)

## Overview

You'll notice some `as any` type assertions in the codebase, particularly when working with Model classes. **This is intentional and safe** - not a workaround to bypass type safety.

## The TypeScript Limitation

TypeScript has a known limitation when trying to match concrete class types (like `typeof TestModel`) with generic interfaces (like `ModelClass<TestModel>`).

### The Problem

```typescript
class TestModel extends Model {
  declare name: string;
  declare age: number;
}

// TypeScript error: typeof TestModel is not assignable to ModelClass<TestModel>
TestModel.objects = new Manager(TestModel, adapter); // ❌ Error
```

### Why TypeScript Can't Prove It

The incompatibility comes from:

1. **Generic Static Methods**
   ```typescript
   // In Model class
   static fromDB<T extends Model>(data: Record<string, unknown>): T {
     return new this(converted) as T;
   }

   // TypeScript sees the generic <T> as potentially different from the class's instance type
   ```

2. **Constructor Signature Variance**
   ```typescript
   // Interface expects:
   interface ModelClass<T> {
     new (...args: unknown[]): T;
   }

   // But Model has:
   constructor(data: Partial<ModelInstance> = {}) { ... }

   // TypeScript can't prove these are compatible
   ```

3. **Covariance vs Contravariance**
   - Method return types are covariant (can return more specific types)
   - Method parameters are contravariant (can accept more general types)
   - Generic static methods create complex variance scenarios TypeScript can't resolve

## Where We Use Type Assertions

### 1. Creating Managers

```typescript
// tests/integration/Lookups.test.ts:40
TestModel.objects = new Manager(TestModel as any, adapter);
```

**Why:** `Manager<T>` expects `ModelClass<T>`, but TypeScript can't prove `typeof TestModel` matches.

**Safe because:** At runtime, `TestModel` IS a valid `ModelClass<TestModel>`. The type assertion just tells TypeScript what's true in practice.

### 2. Direct Adapter Calls

```typescript
// tests/integration/Lookups.test.ts:164
await adapter.create(TestModel as any, { ... });
```

**Why:** `BackendAdapter.create<T>(model: ModelClass<T>, ...)` has the same constraint.

**Safe because:** Same reason - runtime correctness is guaranteed.

### 3. Setting Adapters

```typescript
// tests/integration/Lookups.test.ts:38
(TestModel as any).setAdapter(adapter);
```

**Why:** The `setAdapter` method is added dynamically and TypeScript doesn't see it on `typeof TestModel`.

**Safe because:** The Model base class provides this method via `Model.init()`.

## Why This Is Safe

### ✅ Type Safety Preserved Everywhere Else

```typescript
// All these have full type safety:
const results = await TestModel.objects.filter({ age__gt: 25 });
results[0].name;  // ✅ Autocomplete works
results[0].age;   // ✅ Type-checked

// This would error at compile time:
results[0].nonexistent;  // ❌ Property 'nonexistent' does not exist
```

### ✅ Runtime Correctness Guaranteed

The Model.init() system ensures that at runtime:
- `TestModel` has all required static methods
- `TestModel.objects` returns correct `Manager<TestModel>`
- All instances are properly typed

### ✅ Limited Scope

- Used in **only 2-3 places** per test file
- Always with explanatory comments
- Never spreads beyond the initialization

### ✅ Consistent Pattern

All test files use the same pattern:

```typescript
// Pattern used throughout the codebase
beforeEach(() => {
  (Model as any).setAdapter(adapter);
  Model.objects = new Manager(Model as any, adapter);
});
```

## Alternatives Considered

### ❌ Option 1: Change Interface to Remove Generic from fromDB

```typescript
interface ModelClass<T> {
  fromDB?: (data: Record<string, unknown>) => T;  // Remove <T>
}
```

**Problem:** Breaks the actual `Model.fromDB<T extends Model>()` implementation which needs the generic for flexibility.

### ❌ Option 2: Make fromDB Covariant

```typescript
interface ModelClass<T> {
  fromDB?: <U extends T>(data: Record<string, unknown>) => U;
}
```

**Problem:** Still incompatible due to constructor signature issues.

### ❌ Option 3: Loosen Constructor Signature

```typescript
interface ModelClass<T> {
  new (data?: Partial<ModelInstance>): T;
}
```

**Problem:** Breaks other places that expect generic `new (...args: unknown[])`.

### ❌ Option 4: Code Generation (like Prisma)

**Problem:** Adds significant complexity and build steps. Overkill for this use case.

### ✅ Option 5: Strategic Type Assertions (Current Approach)

**Benefits:**
- Minimal impact (3 lines per test)
- Maintains type safety everywhere else
- No runtime overhead
- No additional complexity

## How Other ORMs Handle This

### TypeORM
```typescript
// TypeORM uses @ts-ignore and as any in many places
@Entity()
class User extends BaseEntity { ... }

// Internally uses: constructor as any
```

### MikroORM
```typescript
// MikroORM uses type assertions for metadata
const meta = MetadataStorage.getMetadata(User as any);
```

### Sequelize
```typescript
// Sequelize uses any for model classes
const User = sequelize.define('User', { ... }) as any;
```

**Conclusion:** This is a **standard pattern** in TypeScript ORMs due to the language's limitations with class types.

## Contributing Guidelines

### When to Use `as any`

✅ **ACCEPTABLE:**
- Bridging between `typeof Model` and `ModelClass<Model>`
- Accessing dynamically added static methods (like `setAdapter`)
- In test files for setup code

❌ **NOT ACCEPTABLE:**
- To bypass actual type errors in business logic
- To avoid fixing real type mismatches
- In production code without documentation

### How to Document

Always add a comment explaining:

```typescript
// Type assertion needed: TypeScript cannot prove that `typeof TestModel` matches
// `ModelClass<TestModel>` due to generic static methods and constructor signatures.
// This is a known TypeScript limitation with class types, not a type safety bypass.
// At runtime, TestModel IS a valid ModelClass<TestModel>.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
TestModel.objects = new Manager(TestModel as any, adapter);
```

### Before Adding New `as any`

Ask yourself:
1. Is this a TypeScript limitation or a real type error?
2. Have I tried proper type solutions first?
3. Is the assertion documented?
4. Is it limited in scope?
5. Does it follow existing patterns?

If unsure, ask in a PR review!

## References

- [TypeScript Issue #3841: Difficulty with typing static side of classes](https://github.com/microsoft/TypeScript/issues/3841)
- [TypeScript Issue #5863: Suggestion: "static" on type parameters](https://github.com/microsoft/TypeScript/issues/5863)
- [TypeScript Handbook: Generics](https://www.typescriptlang.org/docs/handbook/2/generics.html)
- [TypeScript Deep Dive: Covariance and Contravariance](https://basarat.gitbook.io/typescript/type-system/type-compatibility#variance)

## Summary

The `as any` type assertions in Linquery are:
- ✅ **Necessary** due to TypeScript limitations
- ✅ **Safe** - asserting runtime truth
- ✅ **Minimal** - used sparingly
- ✅ **Documented** - with clear explanations
- ✅ **Standard** - common pattern in TypeScript ORMs

They are **not** bypassing type safety - they're acknowledging where TypeScript's static analysis hits its limits while preserving type safety everywhere it matters.
