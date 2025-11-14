# Linquery

A Django-inspired ORM for TypeScript with pluggable backends and offline-first support.

## Overview

Linquery is a flexible Object-Relational Mapping library that brings Django ORM's elegance to the TypeScript ecosystem. It features:

- **Django-style API**: Familiar querysets, field lookups, and model definitions
- **Pluggable Backends**: Use any data source - GraphQL, REST, SQL, Memory, IndexedDB
- **Cross-Adapter Relationships**: Models from different backends can relate to each other
- **Offline-First**: Built-in sync capabilities for offline applications
- **Signals**: Event system for hooking into model lifecycle
- **Type-Safe**: Written in TypeScript with strong type inference

## Quick Start

```typescript
import { Model, Manager, CharField, IntegerField, BooleanField } from 'linquery';
import { MemoryAdapter } from 'linquery/adapters';

// Create adapter
const adapter = new MemoryAdapter();

// Define your model
class Book extends Model {
  declare id?: number;
  declare title: string;
  declare pages: number;
  declare published: boolean;

  static objects: Manager<Book>;
}

// Initialize the model with field definitions
Book.init({
  title: new CharField({ maxLength: 200 }),
  pages: new IntegerField({ min: 1 }),
  published: new BooleanField({ default: false }),
});

// Set adapter and manager
(Book as any).setAdapter(adapter);
Book.objects = new Manager(Book, adapter);

// Create records
const book = await Book.objects.create({
  title: 'TypeScript Handbook',
  pages: 350,
  published: true,
});

// Use Django-style queries
const books = await Book.objects
  .filter({ pages__gte: 200 })
  .filter({ published: true })
  .order_by('-pages')
  .toArray();

// Get single record
const firstBook = await Book.objects.get({ id: 1 });
console.log(firstBook.title);
```

## Key Features

### 1. Chainable QuerySets

```typescript
const queryset = Book.objects
  .filter({ title__startswith: 'The' })
  .filter({ pages__gte: 100 })
  .order_by('-pages', 'title')
  .limit(10);

// Lazy evaluation - query only executes when needed
const results = await queryset.toArray();
```

### 2. Relationships

✅ **Implemented** - ForeignKey and OneToOne relationships with lazy/eager loading.

```typescript
import { ForeignKeyField, OneToOneField } from 'linquery';

class Author extends Model {
  declare id?: number;
  declare name: string;

  static objects: Manager<Author>;
}

Author.init({
  name: new CharField({ maxLength: 100 }),
});

class Post extends Model {
  declare id?: number;
  declare title: string;
  declare author: Author;

  static objects: Manager<Post>;
}

Post.init({
  title: new CharField({ maxLength: 200 }),
  author: new ForeignKeyField(Author, { onDelete: 'CASCADE' }),
});

// Lazy loading (fetches when accessed)
const post = await Post.objects.get({ id: 1 });
const author = await post.author;  // Fetches author on demand

// Eager loading (prevents N+1 queries)
const posts = await Post.objects
  .select_related('author')
  .all()
  .toArray();
// Now post.author is already loaded!

// Reverse relations
const authorPosts = await author.post_set.all().toArray();
```

### 3. Offline-First Support

✅ **Implemented** - Two complementary adapters for offline-first applications.

#### CachedAdapter - Fast UI with Background Updates

Perfect for mobile apps and PWAs that need instant UI responses with background data synchronization.

```typescript
import { CachedAdapter, MemoryAdapter, GraphQLAdapter } from 'linquery';

// Create cached adapter with configurable strategies
const cachedAdapter = new CachedAdapter({
  cache: new MemoryAdapter(),  // Or DexieAdapter for IndexedDB
  remote: new GraphQLAdapter({ endpoint: '/graphql' }),
  readStrategy: 'cache-then-network',  // Return cache, update in background
  writeStrategy: 'network-first',      // Try network first, queue if offline
  enableOfflineQueue: true,
  isOnline: () => navigator.onLine,
});

// Listen to cache events
cachedAdapter.signals.cacheHit.connect((sender, event) => {
  console.log('Serving from cache:', event.model);
});

cachedAdapter.signals.cacheUpdated.connect((sender, event) => {
  console.log('Cache updated from network:', event.model);
  // Update UI with fresh data
});

// Works offline automatically
const post = await Post.objects.create({
  title: 'Offline post',
  content: 'Queued for sync when online'
});
```

#### SyncAdapter - Bidirectional Sync with Conflict Resolution

Best for collaborative apps and multi-device synchronization.

```typescript
import { SyncAdapter, MemoryAdapter, GraphQLAdapter } from 'linquery';

// Create sync adapter for bidirectional sync
const syncAdapter = new SyncAdapter({
  local: new MemoryAdapter(),
  remote: new GraphQLAdapter({ endpoint: '/graphql' }),
  syncStrategy: 'last-write-wins',  // or 'local-wins', 'remote-wins', 'custom'
  autoSync: true,
  syncInterval: 30000,
});

// Register models for sync
syncAdapter.registerModel(Post);

// Bidirectional sync
await syncAdapter.sync();  // Pull then push

// Monitor sync status
const stats = syncAdapter.getQueueStats();
console.log(`Pending: ${stats.pending}, Synced: ${stats.synced}`);
```

### 4. Signals

```typescript
import { signal, SignalType } from 'linquery';

// Listen to model events
signal(SignalType.POST_SAVE).connect(
  async (sender, instance, created) => {
    console.log(`${sender.name} saved:`, instance);
  },
  { sender: User }
);

// Custom signals for sync
signal(SignalType.SYNC_CONFLICT).connect(
  async (sender, operation, conflict) => {
    // Handle sync conflicts
  }
);
```

## Architecture

```
┌─────────────────────────────────────┐
│          User Code                  │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│        ORM Core Layer               │
│  - Models & Fields                  │
│  - QuerySets                        │
│  - Relationships                    │
│  - Signals                          │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│    Backend Adapter Interface        │
└──────────────┬──────────────────────┘
               │
    ┌──────────┼──────────┬──────────┐
    │          │           │          │
┌───▼────┐┌───▼────┐┌────▼───┐┌────▼─────┐
│Memory  ││GraphQL ││Cached  ││Sync      │
│Adapter ││Adapter ││Adapter ││Adapter   │
└────────┘└────────┘└────────┘└──────────┘
```

## Documentation

### Core Documentation
- [Architecture](./docs/ARCHITECTURE.md) - Deep dive into the design
- [API Reference](./docs/API.md) - Complete API documentation
- [TypeScript](./docs/TYPESCRIPT.md) - Type safety and autocomplete

### Features
- [Adapters](./docs/ADAPTERS.md) - Building and using adapters
- [GraphQL Adapter Design](./docs/GRAPHQL_ADAPTER_DESIGN.md) - GraphQL adapter architecture
- [GraphQL Adapter Examples](./docs/GRAPHQL_ADAPTER_EXAMPLES.md) - Customization examples (Hasura, etc.)
- [Cached Adapter](./docs/CACHED_ADAPTER.md) - Offline-first with cache strategies
- [Relationships Design](./docs/RELATIONSHIPS_DESIGN.md) - Relationship implementation details
- [Signals](./docs/SIGNALS.md) - Event system guide
- [Sync & Offline](./docs/SYNC.md) - Offline-first patterns
- [Extensions](./docs/EXTENSIONS.md) - Schema generation, Zod, OpenAPI, plugins

### Best Practices
- [Testing](./docs/TESTING.md) - Testing strategies and examples
- [Error Handling](./docs/ERRORS.md) - Error types and handling
- [Security](./docs/SECURITY.md) - Security best practices
- [Type Assertions](./docs/TYPE_ASSERTIONS.md) - Understanding `as any` usage

### Project
- [Roadmap](./ROADMAP.md) - Development phases
- [Progress Summary](./docs/PROGRESS_SUMMARY.md) - Current project status and achievements

## Installation

```bash
npm install linquery

# Optional: Install specific adapters
npm install @linquery/adapter-graphql
npm install @linquery/adapter-dexie
npm install @linquery/adapter-postgres
```

## Project Status

🚀 **Alpha Release (v0.2.0)** - Phase 1-5 Complete!

Core features fully implemented and production-ready:

- ✅ **4 Adapters Available**
  - MemoryAdapter (in-memory storage)
  - GraphQLAdapter (extensible with 3 customization levels)
  - CachedAdapter (offline-first with cache strategies)
  - SyncAdapter (bidirectional sync with conflict resolution)
- ✅ **Complete ORM Features**
  - QuerySets with chainable API
  - 18 field lookups (__gt, __contains, __in, etc.)
  - Relationships (ForeignKey, OneToOne)
  - Lazy and eager loading (select_related, prefetch_related)
  - Signal system (lifecycle hooks + sync events)
- ✅ **Offline-First Capabilities**
  - Configurable cache strategies
  - Operation queue with retry
  - Conflict resolution strategies
  - Background sync
- ✅ **TypeScript Support**
  - Strict mode enabled
  - Full type inference
  - Field autocomplete

See [ROADMAP.md](./ROADMAP.md) for complete features and timeline.

## Philosophy

Linquery is inspired by Django ORM and follows these principles:

1. **Backend Agnostic**: Your data layer shouldn't dictate your data source
2. **Offline-First**: Modern apps need to work without connectivity
3. **Type-Safe**: Leverage TypeScript for better DX and fewer bugs
4. **Extensible**: Easy to add new adapters, fields, and behaviors

## License

MIT

## Contributing

Contributions are welcome! Please read our contributing guidelines (coming soon).

## Credits

Inspired by Django ORM and built for the TypeScript ecosystem.