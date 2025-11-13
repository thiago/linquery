# Sync & Offline-First

Complete guide to building offline-first applications with ORM.js.

## Table of Contents

- [Overview](#overview)
- [SyncAdapter](#syncadapter)
- [Sync Strategies](#sync-strategies)
- [Conflict Resolution](#conflict-resolution)
- [Online/Offline Detection](#onlineoffline-detection)
- [Sync Queue](#sync-queue)
- [Advanced Patterns](#advanced-patterns)
- [Best Practices](#best-practices)

## Overview

Offline-first means your app works without internet and syncs when connection is available.

### Architecture

```
┌──────────────────────────────────────┐
│         Application Code             │
└────────────┬─────────────────────────┘
             │
             │ Normal ORM API
             ▼
┌──────────────────────────────────────┐
│         SyncAdapter                  │
│  ┌────────────────────────────────┐ │
│  │  Online/Offline Detection      │ │
│  └────────────────────────────────┘ │
│  ┌────────────────────────────────┐ │
│  │  Operation Queue               │ │
│  │  (Pending operations)          │ │
│  └────────────────────────────────┘ │
│  ┌────────────────────────────────┐ │
│  │  Conflict Resolver             │ │
│  └────────────────────────────────┘ │
└────┬────────────────────────┬────────┘
     │                        │
     │ Local                  │ Remote
     ▼                        ▼
┌─────────────┐      ┌─────────────────┐
│   Local     │      │    Remote       │
│  Adapter    │      │   Adapter       │
│             │      │                 │
│ Memory      │      │ GraphQL         │
│ Dexie       │      │ REST            │
│ LocalStorage│      │ SQL (server)    │
└─────────────┘      └─────────────────┘
```

### Flow

**Online:**
1. Write goes to local immediately (fast)
2. Write queued for remote sync
3. Sync to remote (background)
4. On success, mark as synced

**Offline:**
1. Write goes to local immediately
2. Write queued for sync
3. When online, sync queue processes

## SyncAdapter

The `SyncAdapter` wraps local and remote adapters to provide seamless sync.

### Basic Setup

```typescript
import { SyncAdapter, DexieAdapter, GraphQLAdapter } from 'orm-js';

const syncAdapter = new SyncAdapter({
  // Local storage (fast, offline-capable)
  local: new DexieAdapter({ dbName: 'myapp' }),

  // Remote storage (server)
  remote: new GraphQLAdapter({ endpoint: '/graphql' }),

  // Conflict resolution strategy
  syncStrategy: 'last-write-wins',

  // Auto-sync interval (ms)
  syncInterval: 30000,  // Sync every 30s if pending operations
});

class Post extends Model {
  static adapter = syncAdapter;

  title = new CharField();
  content = new TextField();
}
```

### Configuration Options

```typescript
interface SyncAdapterConfig {
  // Required: local and remote adapters
  local: BackendAdapter;
  remote: BackendAdapter;

  // Sync strategy
  syncStrategy:
    | 'last-write-wins'    // Newest timestamp wins
    | 'remote-wins'        // Server always wins
    | 'local-wins'         // Client always wins
    | 'custom';            // Use custom resolver

  // Custom conflict resolver (if strategy is 'custom')
  conflictResolver?: (
    local: any,
    remote: any,
    field?: string
  ) => any | Promise<any>;

  // Auto-sync settings
  syncInterval?: number;         // Auto-sync every N ms
  syncOnReconnect?: boolean;     // Sync when going online (default: true)

  // Retry settings
  maxRetries?: number;           // Max retries per operation (default: 3)
  retryDelay?: number;           // Delay between retries in ms (default: 1000)

  // Pull sync settings
  pullStrategy?: 'polling' | 'websocket' | 'delta' | 'manual';
  pollInterval?: number;         // For polling strategy

  // Callbacks
  onSyncStart?: () => void;
  onSyncComplete?: (result: SyncResult) => void;
  onSyncError?: (error: Error) => void;
  onConflict?: (conflict: Conflict) => void;
}
```

### Usage

The sync adapter works transparently - use normal ORM API:

```typescript
// Create offline
const post = await Post.objects.create({
  title: 'Offline Post',
  content: 'Written without internet',
});
// Saved locally immediately
// Queued for sync when online

// Update offline
post.title = 'Updated Title';
await post.save();
// Updated locally
// Queued for sync

// Query works offline
const posts = await Post.objects.all();
// Returns local data

// Manual sync
await syncAdapter.sync();
// Pushes pending operations to server
// Pulls changes from server
```

## Sync Strategies

### Last-Write-Wins

The version with the newest timestamp wins.

```typescript
const syncAdapter = new SyncAdapter({
  local: localAdapter,
  remote: remoteAdapter,
  syncStrategy: 'last-write-wins',
});
```

**How it works:**
1. Compare `updatedAt` timestamps
2. Newer timestamp wins
3. Simple and predictable

**Pros:**
- Simple to understand
- Works well for most cases
- No user intervention needed

**Cons:**
- Can lose data if timestamps are wrong
- All fields updated, even if only one changed

### Remote-Wins

Server version always wins.

```typescript
const syncAdapter = new SyncAdapter({
  local: localAdapter,
  remote: remoteAdapter,
  syncStrategy: 'remote-wins',
});
```

**Use cases:**
- Server is source of truth
- Client is just a cache
- Read-heavy applications

### Local-Wins

Client version always wins.

```typescript
const syncAdapter = new SyncAdapter({
  local: localAdapter,
  remote: remoteAdapter,
  syncStrategy: 'local-wins',
});
```

**Use cases:**
- Client autonomy is important
- Offline editing tools
- Testing/development

### Custom Strategy

Implement your own conflict resolution:

```typescript
const syncAdapter = new SyncAdapter({
  local: localAdapter,
  remote: remoteAdapter,
  syncStrategy: 'custom',

  conflictResolver: async (local, remote, field) => {
    // Field-level merge
    if (field === 'title') {
      // Always prefer local title
      return local;
    } else if (field === 'content') {
      // Merge content (naive example)
      return local + '\n\n---MERGED---\n\n' + remote;
    } else {
      // Default: newest wins
      return local.updatedAt > remote.updatedAt ? local : remote;
    }
  },
});
```

### Field-Level Merging

Instead of object-level, resolve per field:

```typescript
conflictResolver: async (local, remote) => {
  return {
    // Keep local title
    title: local.title,

    // Take newer content
    content: local.updatedAt > remote.updatedAt
      ? local.content
      : remote.content,

    // Merge tags (union)
    tags: [...new Set([...local.tags, ...remote.tags])],

    // Sum view counts
    viewCount: local.viewCount + remote.viewCount,
  };
}
```

## Conflict Resolution

### Automatic Resolution

Most conflicts resolved automatically based on strategy:

```typescript
// Conflict scenario:
// Local:  { title: 'A', updatedAt: '2023-10-01T10:00:00Z' }
// Remote: { title: 'B', updatedAt: '2023-10-01T11:00:00Z' }

// With 'last-write-wins': Remote wins (newer)
// Result: { title: 'B', updatedAt: '2023-10-01T11:00:00Z' }
```

### Manual Resolution via Signals

For complex conflicts, prompt user:

```typescript
import { signal, SignalType } from 'orm-js';

signal(SignalType.SYNC_CONFLICT).connect(
  async (sender, operation, conflict) => {
    const { local, remote, fields } = conflict;

    // Show UI dialog
    const resolution = await showConflictDialog({
      modelType: sender.name,
      localVersion: local,
      remoteVersion: remote,
      conflictingFields: fields,
    });

    // Return resolved version
    return resolution;
  }
);
```

### Conflict Dialog Example

```typescript
async function showConflictDialog({ localVersion, remoteVersion }) {
  return new Promise((resolve) => {
    // Pseudo-code for UI
    showDialog({
      title: 'Sync Conflict',
      message: 'Local and remote versions differ',
      options: [
        {
          label: 'Keep Local',
          action: () => resolve(localVersion),
        },
        {
          label: 'Use Remote',
          action: () => resolve(remoteVersion),
        },
        {
          label: 'Merge...',
          action: () => {
            // Show merge editor
            const merged = showMergeEditor(localVersion, remoteVersion);
            resolve(merged);
          },
        },
      ],
    });
  });
}
```

### Three-Way Merge

Track original value for better merging:

```typescript
// Store base version when fetching
const post = await Post.objects.get({ id: 1 });
post._baseVersion = { ...post.toJSON() };

// User edits
post.title = 'New Title';
await post.save();

// On conflict, compare three versions:
conflictResolver: (local, remote) => {
  const base = local._baseVersion;

  return {
    // If neither changed, keep base
    // If one changed, take the change
    // If both changed differently, conflict
    title: resolveField(base.title, local.title, remote.title),
    content: resolveField(base.content, local.content, remote.content),
  };
}

function resolveField(base, local, remote) {
  if (local === remote) return local;
  if (local === base) return remote;  // Only remote changed
  if (remote === base) return local;  // Only local changed
  // Both changed - conflict!
  throw new ConflictError();
}
```

## Online/Offline Detection

### Automatic Detection

SyncAdapter automatically detects connectivity:

```typescript
const syncAdapter = new SyncAdapter({
  local: localAdapter,
  remote: remoteAdapter,
  syncOnReconnect: true,  // Auto-sync when going online
});

// Listen to connectivity changes
syncAdapter.on('online', () => {
  console.log('Back online! Syncing...');
});

syncAdapter.on('offline', () => {
  console.log('Offline mode');
});
```

### Manual Status Check

```typescript
if (syncAdapter.isOnline) {
  console.log('Online');
} else {
  console.log('Offline');
}

// Get pending operations count
const pending = syncAdapter.getPendingCount();
console.log(`${pending} operations pending sync`);
```

### Custom Detection

Override default detection:

```typescript
const syncAdapter = new SyncAdapter({
  // ...
  onlineDetector: async () => {
    // Custom logic
    try {
      await fetch('/api/ping', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  },
});
```

## Sync Queue

### Queue Operations

All offline operations are queued:

```typescript
// Each operation stored in queue
interface QueuedOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  model: string;
  data: any;
  localId: string;
  timestamp: Date;
  retries: number;
  error?: Error;
}
```

### View Queue

```typescript
const queue = await syncAdapter.getQueue();

for (const op of queue) {
  console.log(op.type, op.model, op.data);
}
```

### Clear Queue

```typescript
// Clear all
await syncAdapter.clearQueue();

// Clear specific model
await syncAdapter.clearQueue({ model: 'Post' });

// Clear specific operation
await syncAdapter.removeFromQueue(operationId);
```

### Retry Failed Operations

```typescript
// Retry all failed
await syncAdapter.retryFailed();

// Retry specific operation
await syncAdapter.retryOperation(operationId);
```

## Advanced Patterns

### Read-Through Cache

Use remote as source, local as cache:

```typescript
const syncAdapter = new SyncAdapter({
  local: new DexieAdapter({ dbName: 'cache' }),
  remote: new GraphQLAdapter({ endpoint: '/graphql' }),

  // Always prefer remote when online
  readStrategy: 'remote-first',

  // Cache responses locally
  cacheStrategy: 'cache-and-network',
});

// When online:
// 1. Check local cache (fast response)
// 2. Fetch from remote (background)
// 3. Update local cache
// 4. Notify app of fresh data

// When offline:
// 1. Return cached data
```

### Delta Sync

Only sync changes since last sync:

```typescript
const syncAdapter = new SyncAdapter({
  local: localAdapter,
  remote: remoteAdapter,
  pullStrategy: 'delta',
});

// Remote API should support:
// GET /api/posts?since=2023-10-01T10:00:00Z
// Returns only posts modified after timestamp

// SyncAdapter tracks last sync time
// Only pulls deltas, not full dataset
```

### WebSocket Real-Time Sync

```typescript
const syncAdapter = new SyncAdapter({
  local: localAdapter,
  remote: remoteAdapter,
  pullStrategy: 'websocket',
  wsEndpoint: 'wss://api.example.com/sync',
});

// Server pushes changes via WebSocket
// Client receives and updates local store
// No polling needed
```

### Selective Sync

Only sync certain models or data:

```typescript
const syncAdapter = new SyncAdapter({
  local: localAdapter,
  remote: remoteAdapter,

  // Only sync specific models
  syncModels: ['Post', 'Comment'],

  // Or filter by query
  syncFilter: {
    Post: { published: true },
    Comment: { spam: false },
  },
});
```

### Batched Sync

Sync multiple operations in single request:

```typescript
const syncAdapter = new SyncAdapter({
  local: localAdapter,
  remote: remoteAdapter,

  // Batch operations
  batchSync: true,
  batchSize: 50,  // Max operations per batch
  batchDelay: 5000,  // Wait 5s for more ops before syncing
});

// Multiple operations batched into one request
await Post.objects.create({ title: 'A' });
await Post.objects.create({ title: 'B' });
await Post.objects.create({ title: 'C' });

// After 5s or 50 operations, single request:
// POST /api/sync
// { operations: [{ create Post A }, { create Post B }, ...] }
```

### Optimistic UI

Show changes immediately, revert on error:

```typescript
const syncAdapter = new SyncAdapter({
  local: localAdapter,
  remote: remoteAdapter,
  optimisticUpdates: true,
});

// Update UI immediately
const post = await Post.objects.get({ id: 1 });
post.title = 'New Title';
await post.save();

// UI shows "New Title" immediately
// Syncs to remote in background

// If remote fails:
signal(SignalType.SYNC_ERROR).connect((sender, operation, error) => {
  // Revert UI
  showNotification('Failed to sync. Changes reverted.');
});
```

### Migration Between Adapters

Move data from one adapter to another:

```typescript
const oldAdapter = new LocalStorageAdapter();
const newAdapter = new DexieAdapter({ dbName: 'myapp' });

// Migrate
await syncAdapter.migrate(oldAdapter, newAdapter, {
  models: [Post, Comment, User],
  deleteSource: false,  // Keep old data
});
```

## Best Practices

### 1. Always Use Timestamps

```typescript
class BaseModel extends Model {
  createdAt = new DateTimeField({ autoNowAdd: true });
  updatedAt = new DateTimeField({ autoNow: true });
}

class Post extends BaseModel {
  title = new CharField();
}
```

### 2. Use UUIDs for Offline Creation

```typescript
class Post extends Model {
  // Use UUID instead of auto-increment
  id = new UUIDField({ primary: true, default: uuid });
}

// Both local and remote use same ID
// No need to map local ID to remote ID
```

### 3. Track Sync Status

```typescript
class Post extends Model {
  title = new CharField();

  // Metadata
  _syncStatus = new CharField({
    choices: ['pending', 'synced', 'conflict', 'error'],
    default: 'pending',
  });
  _lastSyncedAt = new DateTimeField({ required: false });
}

// Show sync status in UI
if (post._syncStatus === 'pending') {
  showSyncIndicator();
}
```

### 4. Handle Deletions

```typescript
// Soft delete for sync
class Post extends Model {
  title = new CharField();
  deleted = new BooleanField({ default: false });
  deletedAt = new DateTimeField({ required: false });
}

// Override delete
class Post extends Model {
  async delete() {
    this.deleted = true;
    this.deletedAt = new Date();
    await this.save();
  }
}

// Filter deleted by default
class PostManager extends Manager<Post> {
  all() {
    return super.all().filter({ deleted: false });
  }
}
```

### 5. Limit Queue Size

```typescript
const syncAdapter = new SyncAdapter({
  // ...
  maxQueueSize: 1000,

  // When queue full
  queueOverflowStrategy: 'drop-oldest' | 'drop-newest' | 'error',
});
```

### 6. Notify Users

```typescript
signal(SignalType.POST_SYNC).connect((sender, result) => {
  if (result.conflicts > 0) {
    showNotification(`Synced with ${result.conflicts} conflicts`);
  } else {
    showNotification('Synced successfully');
  }
});
```

### 7. Progressive Sync

Sync critical data first:

```typescript
// Sync user's own posts first
await syncAdapter.sync({
  priority: 'high',
  models: ['Post'],
  filter: { author_id: currentUser.id },
});

// Then sync everything else
await syncAdapter.sync();
```

### 8. Test Offline Scenarios

```typescript
// Simulate offline
syncAdapter.setOnline(false);

// Perform operations
await Post.objects.create({ title: 'Offline' });

// Verify queued
const queue = await syncAdapter.getQueue();
expect(queue.length).toBe(1);

// Go online and sync
syncAdapter.setOnline(true);
await syncAdapter.sync();

// Verify synced
expect(queue.length).toBe(0);
```

## Complete Example

```typescript
import {
  Model,
  CharField,
  TextField,
  DateTimeField,
  SyncAdapter,
  DexieAdapter,
  GraphQLAdapter,
  signal,
  SignalType,
} from 'orm-js';

// Setup sync adapter
const syncAdapter = new SyncAdapter({
  local: new DexieAdapter({ dbName: 'blog' }),
  remote: new GraphQLAdapter({ endpoint: '/graphql' }),
  syncStrategy: 'last-write-wins',
  syncInterval: 30000,
  syncOnReconnect: true,
});

// Model
class Post extends Model {
  static adapter = syncAdapter;

  id = new UUIDField({ primary: true, default: uuid });
  title = new CharField({ maxLength: 200 });
  content = new TextField();
  createdAt = new DateTimeField({ autoNowAdd: true });
  updatedAt = new DateTimeField({ autoNow: true });

  // Sync metadata
  _syncStatus = new CharField({ default: 'pending' });
  _lastSyncedAt = new DateTimeField({ required: false });
}

// Listen to sync events
signal(SignalType.POST_SYNC).connect((sender, operation, result) => {
  // Update sync status
  Post.objects
    .filter({ id: operation.data.id })
    .update({ _syncStatus: 'synced', _lastSyncedAt: new Date() });
});

signal(SignalType.SYNC_CONFLICT).connect(async (sender, operation, conflict) => {
  // Show conflict UI
  const resolved = await showConflictDialog(conflict);
  return resolved;
});

// Usage
async function main() {
  // Create offline
  const post = await Post.objects.create({
    title: 'Offline Post',
    content: 'Written without internet',
  });

  console.log('Created locally:', post.id);
  console.log('Sync status:', post._syncStatus);  // 'pending'

  // Update
  post.title = 'Updated Offline';
  await post.save();

  // Manual sync
  const result = await syncAdapter.sync();
  console.log('Synced:', result);
  // { pushed: 2, pulled: 0, conflicts: 0 }

  // Query (works offline)
  const posts = await Post.objects.all();
  console.log('Posts:', posts.length);
}

// React component example
function PostEditor({ postId }) {
  const [post, setPost] = useState(null);
  const [syncStatus, setSyncStatus] = useState('synced');

  useEffect(() => {
    // Load post
    Post.objects.get({ id: postId }).then(setPost);

    // Listen to sync status
    const unsubscribe = signal(SignalType.POST_SYNC).connect(
      (sender, op) => {
        if (op.data.id === postId) {
          setSyncStatus('synced');
        }
      }
    );

    return unsubscribe;
  }, [postId]);

  const handleSave = async () => {
    setSyncStatus('pending');
    post.title = newTitle;
    await post.save();

    // Sync in background
    syncAdapter.sync();
  };

  return (
    <div>
      <input value={post?.title} onChange={e => setTitle(e.target.value)} />
      <button onClick={handleSave}>Save</button>
      {syncStatus === 'pending' && <span>Syncing...</span>}
    </div>
  );
}
```
