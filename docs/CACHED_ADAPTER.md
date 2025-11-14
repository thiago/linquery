# CachedAdapter - Offline-First Cache Layer

The `CachedAdapter` is a powerful adapter that combines a cache layer with a remote backend to provide offline-first capabilities with configurable sync strategies.

## Overview

The `CachedAdapter` orchestrates between two adapters:
- **Cache Adapter**: Local storage (e.g., Dexie, LocalStorage, Memory)
- **Remote Adapter**: Remote backend (e.g., GraphQL, REST API)

It provides:
- Configurable read strategies (cache-first, network-first, cache-then-network)
- Configurable write strategies (network-first, cache-first)
- Offline operation queue with automatic retry
- Real-time sync events via Signals
- Intelligent cache invalidation

## Basic Usage

```typescript
import { CachedAdapter } from 'linquery/adapters';
import { DexieAdapter } from './adapters/DexieAdapter';
import { GraphQLAdapter } from 'linquery/adapters';

// Create adapters
const cacheAdapter = new DexieAdapter(db);
const remoteAdapter = new GraphQLAdapter({ endpoint: 'https://api.example.com/graphql' });

// Create cached adapter
const cachedAdapter = new CachedAdapter({
  cache: cacheAdapter,
  remote: remoteAdapter,
  readStrategy: 'cache-then-network',
  writeStrategy: 'network-first',
  enableOfflineQueue: true,
});

// Use with your models
Post.init(
  {
    id: new IntegerField({ primaryKey: true }),
    title: new CharField({ maxLength: 200 }),
    content: new TextField(),
  },
  {
    adapter: cachedAdapter,
  }
);

// Now all Post operations use the cached adapter
const posts = await Post.objects.all();
```

## Read Strategies

### cache-first
Returns data from cache without calling the network.

**Best for**: Static data, rarely changing data, offline-first apps

```typescript
const adapter = new CachedAdapter({
  cache: cacheAdapter,
  remote: remoteAdapter,
  readStrategy: 'cache-first',
});

// Only reads from cache, never hits network
const post = await Post.objects.get(1);
```

### network-first
Tries network first, falls back to cache if offline or network fails.

**Best for**: Real-time data, frequently changing data

```typescript
const adapter = new CachedAdapter({
  cache: cacheAdapter,
  remote: remoteAdapter,
  readStrategy: 'network-first',
});

// Tries network first, cache on failure
const post = await Post.objects.get(1);
```

### cache-then-network (Default)
Returns cache immediately, fetches from network in background to update cache.

**Best for**: Fast UI with fresh data, Instagram-like UX

```typescript
const adapter = new CachedAdapter({
  cache: cacheAdapter,
  remote: remoteAdapter,
  readStrategy: 'cache-then-network',
});

// Returns cache immediately
const post = await Post.objects.get(1);
// UI shows cached data instantly

// Network fetch happens in background
// UI updates automatically when fresh data arrives (via signals)
```

## Write Strategies

### network-first (Default)
Tries to write to network first, queues for offline if fails.

**Best for**: Most applications, ensures data consistency

```typescript
const adapter = new CachedAdapter({
  cache: cacheAdapter,
  remote: remoteAdapter,
  writeStrategy: 'network-first',
});

// When online: network → success → cache
// When offline: cache → queue for later sync
await Post.objects.create({ title: 'New Post' });
```

### cache-first
Writes to cache first, syncs to network in background.

**Best for**: High-frequency writes, optimistic UI updates

```typescript
const adapter = new CachedAdapter({
  cache: cacheAdapter,
  remote: remoteAdapter,
  writeStrategy: 'cache-first',
});

// Writes to cache immediately
// Syncs to network in background
await Post.objects.create({ title: 'New Post' });
```

## Sync Events

The CachedAdapter emits events that you can listen to for UI updates:

```typescript
// Cache hit - data served from cache
adapter.signals.cacheHit.connect((sender, event) => {
  console.log('Cache hit:', event.model, event.data);
});

// Network fetch - data fetched from network
adapter.signals.networkFetch.connect((sender, event) => {
  console.log('Network fetch:', event.model, event.data);
});

// Cache updated - cache was updated with fresh data from network
adapter.signals.cacheUpdated.connect((sender, event) => {
  console.log('Cache updated:', event.model, event.data);
  // Update UI with fresh data
  updateUI(event.data);
});

// Operation queued - operation queued for offline sync
adapter.signals.operationQueued.connect((sender, operation) => {
  console.log('Queued for sync:', operation);
  showSyncIndicator(true);
});

// Operation synced - queued operation successfully synced
adapter.signals.operationSynced.connect((sender, event) => {
  console.log('Synced:', event.operation);
  showSyncIndicator(false);
});

// Sync failed - queued operation failed after max retries
adapter.signals.syncFailed.connect((sender, event) => {
  console.error('Sync failed:', event.operation, event.error);
  showSyncError(event.error);
});
```

## Offline Queue

When offline, write operations are automatically queued and retried when back online:

```typescript
const adapter = new CachedAdapter({
  cache: cacheAdapter,
  remote: remoteAdapter,
  enableOfflineQueue: true, // Default: true
  maxRetries: 3, // Default: 3
  retryDelayMs: (attempt) => Math.min(1000 * 2 ** attempt, 30000), // Exponential backoff
});

// When offline
await Post.objects.create({ title: 'Offline Post' });
// → Stored in cache + queued for sync

// When back online
adapter.processQueue(); // Manually trigger (or wait for auto-sync)
// → Queued operations are synced to server
```

## Connectivity Detection

Provide your own connectivity detection:

```typescript
const adapter = new CachedAdapter({
  cache: cacheAdapter,
  remote: remoteAdapter,
  isOnline: () => {
    // Custom logic
    return navigator.onLine;
    // Or: return fetch('/ping').then(() => true).catch(() => false);
  },
});
```

## React Integration Example

```typescript
import { useState, useEffect } from 'react';

function PostList() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen for cache updates
    const unsubscribe = cachedAdapter.signals.cacheUpdated.connect(
      (sender, event) => {
        if (event.model === 'Post') {
          setPosts(event.data as Post[]);
        }
      }
    );

    // Load posts
    Post.objects.all().then((data) => {
      setPosts(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div>
      {loading && <Spinner />}
      {posts.map((post) => (
        <PostItem key={post.id} post={post} />
      ))}
    </div>
  );
}
```

## Mobile App Example (React Native + Dexie)

```typescript
import Dexie from 'dexie';
import { CachedAdapter, GraphQLAdapter } from 'linquery';
import NetInfo from '@react-native-community/netinfo';

// Setup Dexie
const db = new Dexie('myAppDB');
db.version(1).stores({
  posts: 'id, title, updated_at',
});

const cacheAdapter = new DexieAdapter(db);
const remoteAdapter = new GraphQLAdapter({
  endpoint: 'https://api.example.com/graphql',
});

const cachedAdapter = new CachedAdapter({
  cache: cacheAdapter,
  remote: remoteAdapter,
  readStrategy: 'cache-then-network',
  writeStrategy: 'network-first',
  enableOfflineQueue: true,
  isOnline: async () => {
    const state = await NetInfo.fetch();
    return state.isConnected;
  },
});

// Listen for connectivity changes
NetInfo.addEventListener((state) => {
  if (state.isConnected) {
    // Back online, process queue
    cachedAdapter.processQueue();
  }
});
```

## Configuration Options

```typescript
interface CachedAdapterOptions {
  /** Cache backend adapter (e.g., DexieAdapter, LocalStorageAdapter) */
  cache: BackendAdapter;

  /** Remote backend adapter (e.g., GraphQLAdapter, RESTAdapter) */
  remote: BackendAdapter;

  /** Strategy for read operations */
  readStrategy?: 'cache-first' | 'network-first' | 'cache-then-network';

  /** Strategy for write operations */
  writeStrategy?: 'network-first' | 'cache-first';

  /** Enable offline queue for failed operations */
  enableOfflineQueue?: boolean;

  /** Maximum number of retries for queued operations */
  maxRetries?: number;

  /** Function to determine if the client is online */
  isOnline?: () => boolean | Promise<boolean>;

  /** Retry delay calculator (attempt number => milliseconds) */
  retryDelayMs?: (attempt: number) => number;
}
```

## Best Practices

### 1. Choose the Right Read Strategy

- **cache-then-network**: Best for most apps (Instagram/Twitter-like UX)
- **network-first**: For real-time data (chat, live feeds)
- **cache-first**: For static/reference data (settings, constants)

### 2. Handle Sync Conflicts

```typescript
adapter.signals.syncFailed.connect((sender, event) => {
  if (event.error.message.includes('conflict')) {
    // Show conflict resolution UI
    showConflictResolution(event.operation);
  }
});
```

### 3. Show Sync Status

```typescript
let pendingOps = 0;

adapter.signals.operationQueued.connect(() => {
  pendingOps++;
  updateSyncBadge(pendingOps);
});

adapter.signals.operationSynced.connect(() => {
  pendingOps--;
  updateSyncBadge(pendingOps);
});
```

### 4. Prefetch Critical Data

```typescript
// On app start, prefetch critical data
await Promise.all([
  User.objects.all(),
  Settings.objects.all(),
  RecentPosts.objects.filter({ limit: 20 }),
]);
```

### 5. Clear Cache Periodically

```typescript
// Clear old cache data
await cacheAdapter.delete(Post, { updated_at__lt: Date.now() - 30 * 24 * 60 * 60 * 1000 });
```

## Advanced: Custom Cache Invalidation

```typescript
// Invalidate cache on specific events
adapter.signals.networkFetch.connect((sender, event) => {
  if (event.model === 'Post' && event.operation === 'write') {
    // Invalidate post list cache
    cacheAdapter.delete(Post, {});
  }
});
```

## Advanced: Multi-Layer Caching

```typescript
// Memory → IndexedDB → Network
const memoryCache = new MemoryAdapter();
const indexedDBCache = new DexieAdapter(db);
const network = new GraphQLAdapter({ endpoint: '...' });

const l1Cache = new CachedAdapter({
  cache: memoryCache,
  remote: indexedDBCache,
  readStrategy: 'cache-first',
});

const l2Cache = new CachedAdapter({
  cache: l1Cache,
  remote: network,
  readStrategy: 'cache-then-network',
});
```

## Troubleshooting

### Queue Not Processing

```typescript
// Manually trigger queue processing
await adapter.processQueue();

// Check online status
const online = await adapter.isOnline();
console.log('Online:', online);
```

### Cache Not Updating

```typescript
// Check if signals are connected
adapter.signals.cacheUpdated.connect((sender, event) => {
  console.log('Cache updated:', event);
});

// Verify cache adapter supports get/list methods
console.log(typeof cacheAdapter.get); // should be 'function'
```

### Memory Leaks

```typescript
// Always disconnect signals when component unmounts
useEffect(() => {
  const unsubscribe = adapter.signals.cacheUpdated.connect(handler);
  return () => unsubscribe();
}, []);
```

## See Also

- [Adapters Documentation](./ADAPTERS.md)
- [GraphQL Adapter](./GRAPHQL_ADAPTER_DESIGN.md)
- [Sync Documentation](./SYNC.md)
- [Signals Documentation](./SIGNALS.md)
