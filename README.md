# ORM-like Query System for JavaScript/TypeScript

This project provides a fully extensible ORM-like system designed for use with both in-memory and persistent backends (e.g., Dexie for IndexedDB, GraphQL APIs). It models core ORM principles (inspired by Django) such as `BaseModel`, `QuerySet`, `Field` abstraction, `SignalRegistry`, and registry-based model relationships.

## Features

- Declarative model and field system
- Powerful filtering and lookup API (inspired by Django)
- Backends for memory, Dexie (IndexedDB), and GraphQL
- Signal hooks (`pre_save`, `post_save`, etc.)
- Dynamic model registration and relationship inference
- Testable, extendable, and backend-agnostic architecture

---

## Installation

```bash
npm install --save <your-package-name>
```

---

## Example: Defining a Model

```ts
import { BaseModel, StringField, NumberField } from "./model/base-model"

class User extends BaseModel {
  id!: string
  name!: string
  age!: number

  static fields = {
    id: StringField(),
    name: StringField(),
    age: NumberField()
  }

  static objects = memoryBackend.queryset(User)
}
```

---

## Creating Instances

```ts
const user = User.new({ id: "u1", name: "Alice", age: 30 })
await user.save()
```

---

## Querying Data

```ts
const results = await User.objects.filter({ name: "Alice" }).execute()
const count = await User.objects.filter({ age: { gte: 18 }}).count()
```

## Chained Filters & Ordering

```ts
const users = await User.objects
  .filter({ name: { contains: "A" } })
  .orderBy("-age")
  .limit(5)
  .execute()
```

## Fetching Relationships

```ts
const group = await user.getRelated("group")
const users = await group.getRelatedMany("User", "group")
```

---

## Signals

```ts
User.signals.on("pre_save", User, async (instance) => {
  console.log("Saving user", instance.name)
})
```

---

## Backends

### MemoryBackend

```ts
import { MemoryBackend } from "./backends/memory"

const memoryBackend = new MemoryBackend<User, Filter<User>>()
```

### DexieBackend

```ts
import { DexieBackend } from "./backends/dexie"

const dexieBackend = new DexieBackend(User, {
  tableName: "users",
  indexes: ["name", "age"]
})
```

### GraphQLBackend

```ts
import { Graphql } from "./backends/graphql"

const gqlBackend = new Graphql<User, UserFilter, UserOrder>((params) => {
  return client.getUsers(params)  // Your GraphQL client call
}, User)
```

---

## Advanced Filtering

```ts
const filtered = await User.objects.filter({
  OR: {
    name: "Ana",
    OR: { name: "Bia" }
  },
  age: { gte: 18 }
}).execute()
```

## Inferred Fields

If you don’t declare static `fields`, they will be inferred from class properties.

---

## Running Tests

```bash
npm test
```

Or if using Vitest:

```bash
npx vitest run
```

All major features are covered by tests:

- Field serialization/deserialization
- Query chaining (filter, exclude, order, limit)
- Relationship resolution
- Lifecycle signals

---

## License

MIT

---

## TODOs & Contributions

- Add mutation support to GraphQL backend
- Add validation system for fields
- Add support for many-to-many relationships

Contributions welcome!

