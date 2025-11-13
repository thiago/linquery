# SyncAdapter Design Document

## Overview

O SyncAdapter é um adapter especial que envolve dois adapters (local e remote) para fornecer funcionalidade offline-first. Ele intercepta todas as operações do ORM, armazena localmente primeiro, e sincroniza com o backend quando online.

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Model Layer                        │
│         (User code interacts here)              │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────┐
│           SyncAdapter                           │
│  ┌──────────────────────────────────────────┐  │
│  │   Operation Queue                        │  │
│  │   - CREATE, UPDATE, DELETE operations    │  │
│  │   - Pending, Failed, Synced status       │  │
│  └──────────────────────────────────────────┘  │
│                                                  │
│  ┌──────────────────────────────────────────┐  │
│  │   Sync Engine                            │  │
│  │   - Push/Pull operations                 │  │
│  │   - Conflict resolution                  │  │
│  │   - Retry logic                          │  │
│  └──────────────────────────────────────────┘  │
│                                                  │
│  ┌──────────────────────────────────────────┐  │
│  │   Online/Offline Detection               │  │
│  │   - Navigator.onLine                     │  │
│  │   - Custom connectivity checks           │  │
│  └──────────────────────────────────────────┘  │
└─────────┬─────────────────────┬─────────────────┘
          │                     │
┌─────────▼────────┐  ┌─────────▼─────────┐
│  Local Adapter   │  │  Remote Adapter   │
│  (MemoryAdapter, │  │  (GraphQLAdapter, │
│   LocalStorage,  │  │   RESTAdapter,    │
│   Dexie, etc.)   │  │   etc.)           │
└──────────────────┘  └───────────────────┘
```

## Core Components

### 1. SyncAdapter

O adapter principal que implementa a interface `BackendAdapter`.

```typescript
interface SyncAdapterOptions {
  // Required adapters
  local: BackendAdapter;
  remote: BackendAdapter;

  // Sync strategy
  syncStrategy?: SyncStrategy;
  conflictResolver?: ConflictResolver;

  // Sync behavior
  autoSync?: boolean;          // Auto sync when online (default: true)
  syncInterval?: number;        // Auto sync interval in ms (default: 30000)
  retryAttempts?: number;       // Retry failed operations (default: 3)
  retryDelay?: number;          // Delay between retries in ms (default: 1000)

  // Queue behavior
  maxQueueSize?: number;        // Max operations in queue (default: 1000)
  persistQueue?: boolean;       // Persist queue to storage (default: true)

  // Connectivity
  onlineCheck?: () => Promise<boolean>;  // Custom online check
}

type SyncStrategy = 'last-write-wins' | 'remote-wins' | 'local-wins' | 'custom';

interface ConflictResolver {
  resolve<T>(
    local: T,
    remote: T,
    operation: QueuedOperation
  ): Promise<T | 'use-local' | 'use-remote' | 'skip'>;
}
```

### 2. Operation Queue

Armazena operações pendentes para sincronização.

```typescript
interface QueuedOperation {
  id: string;                   // Unique operation ID
  type: 'create' | 'update' | 'delete';
  modelName: string;            // Model class name
  data: Record<string, unknown>;
  timestamp: number;            // When operation was queued
  attempts: number;             // Number of sync attempts
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  error?: string;               // Last error message
  localId?: unknown;            // Local ID (for creates)
  remoteId?: unknown;           // Remote ID (after sync)
}

class OperationQueue {
  private operations: Map<string, QueuedOperation> = new Map();

  add(operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'attempts' | 'status'>): string;
  get(id: string): QueuedOperation | undefined;
  getAll(): QueuedOperation[];
  getPending(): QueuedOperation[];
  getFailed(): QueuedOperation[];
  update(id: string, updates: Partial<QueuedOperation>): void;
  remove(id: string): void;
  clear(): void;

  // Persistence
  async save(): Promise<void>;
  async load(): Promise<void>;
}
```

### 3. Sync Engine

Gerencia a sincronização entre local e remote.

```typescript
class SyncEngine {
  constructor(
    private local: BackendAdapter,
    private remote: BackendAdapter,
    private queue: OperationQueue,
    private options: SyncAdapterOptions
  ) {}

  /**
   * Push local changes to remote
   */
  async push(): Promise<SyncResult>;

  /**
   * Pull remote changes to local
   */
  async pull(): Promise<SyncResult>;

  /**
   * Bidirectional sync (pull then push)
   */
  async sync(): Promise<SyncResult>;

  /**
   * Process a single queued operation
   */
  private async processOperation(op: QueuedOperation): Promise<void>;

  /**
   * Resolve conflict between local and remote
   */
  private async resolveConflict<T>(
    local: T,
    remote: T,
    operation: QueuedOperation
  ): Promise<T>;
}

interface SyncResult {
  success: boolean;
  pushed: number;      // Number of operations pushed
  pulled: number;      // Number of records pulled
  conflicts: number;   // Number of conflicts resolved
  failed: number;      // Number of failed operations
  errors: Array<{ operation: QueuedOperation; error: string }>;
}
```

### 4. Connectivity Manager

Detecta e monitora status online/offline.

```typescript
class ConnectivityManager {
  private isOnline: boolean = true;
  private listeners: Array<(online: boolean) => void> = [];

  constructor(private customCheck?: () => Promise<boolean>) {
    this.initialize();
  }

  private initialize(): void {
    // Listen to browser online/offline events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.setOnline(true));
      window.addEventListener('offline', () => this.setOnline(false));
    }
  }

  async checkOnline(): Promise<boolean> {
    if (this.customCheck) {
      return this.customCheck();
    }
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  getOnlineStatus(): boolean {
    return this.isOnline;
  }

  onChange(listener: (online: boolean) => void): void {
    this.listeners.push(listener);
  }

  private setOnline(online: boolean): void {
    if (this.isOnline !== online) {
      this.isOnline = online;
      this.listeners.forEach(listener => listener(online));
    }
  }
}
```

## Operation Flow

### 1. Create Operation (Offline)

```
1. User calls Model.objects.create(data)
2. SyncAdapter.create() is called
3. Generate temporary local ID (e.g., "local-123")
4. Save to local adapter with local ID
5. Add CREATE operation to queue
6. Return instance with local ID
7. When online: sync engine processes queue
8. Create in remote adapter
9. Get real remote ID
10. Update local record with remote ID
11. Mark operation as synced
12. Emit POST_SYNC signal
```

### 2. Update Operation (Offline)

```
1. User calls instance.save()
2. SyncAdapter.update() is called
3. Update in local adapter immediately
4. Add UPDATE operation to queue
5. When online: sync engine processes queue
6. Update in remote adapter
7. Check for conflicts (compare timestamps)
8. If conflict: resolve using strategy
9. Mark operation as synced
```

### 3. Delete Operation (Offline)

```
1. User calls instance.delete()
2. SyncAdapter.delete() is called
3. Mark as deleted in local adapter (soft delete)
4. Add DELETE operation to queue
5. When online: sync engine processes queue
6. Delete in remote adapter
7. Permanently delete from local
8. Mark operation as synced
```

### 4. Read Operations (Always Local)

```
1. User calls Model.objects.filter(...).toArray()
2. SyncAdapter.find() is called
3. Query local adapter only
4. Return local data immediately
5. Optionally trigger background sync
```

## Conflict Resolution Strategies

### 1. Last-Write-Wins (Default)

```typescript
async function lastWriteWins<T>(local: T, remote: T, op: QueuedOperation): Promise<T> {
  const localTime = (local as any).updatedAt || op.timestamp;
  const remoteTime = (remote as any).updatedAt || 0;

  return localTime > remoteTime ? local : remote;
}
```

### 2. Remote-Wins

```typescript
async function remoteWins<T>(local: T, remote: T): Promise<T> {
  return remote;
}
```

### 3. Local-Wins

```typescript
async function localWins<T>(local: T, remote: T): Promise<T> {
  return local;
}
```

### 4. Custom Resolver

```typescript
const customResolver: ConflictResolver = {
  async resolve<T>(local: T, remote: T, operation: QueuedOperation): Promise<T> {
    // Emit signal for user to handle
    const result = await signals.syncConflict.send({
      sender: operation.modelName,
      local,
      remote,
      operation,
    });

    // User can return resolved version or instruction
    return result || 'use-remote';
  }
};
```

## Signals

### New Signals for Sync

```typescript
// Emitted before sync operation
export const preSyncSignal = new Signal<{
  sender: string;
  operation: 'push' | 'pull' | 'sync';
}>();

// Emitted after successful sync
export const postSyncSignal = new Signal<{
  sender: string;
  operation: 'push' | 'pull' | 'sync';
  result: SyncResult;
}>();

// Emitted when conflict occurs
export const syncConflictSignal = new Signal<{
  sender: string;
  local: unknown;
  remote: unknown;
  operation: QueuedOperation;
}>();

// Emitted when online status changes
export const connectivityChangeSignal = new Signal<{
  online: boolean;
}>();
```

## Implementation Phases

### Phase 5.1: Foundation (Week 1)

**Goal:** Basic SyncAdapter structure

- [ ] Create SyncAdapter class skeleton
- [ ] Implement OperationQueue class
- [ ] Implement ConnectivityManager
- [ ] Add basic CRUD that writes to local + queues operations
- [ ] Add new signals (pre_sync, post_sync, sync_conflict, connectivity_change)
- [ ] Basic tests (local operations, queue management)

**Deliverable:** SyncAdapter that works offline (no actual syncing yet)

### Phase 5.2: Push Sync (Week 2)

**Goal:** Push local changes to remote

- [ ] Implement SyncEngine.push()
- [ ] Implement SyncEngine.processOperation()
- [ ] Handle ID mapping (local ID → remote ID)
- [ ] Implement retry logic
- [ ] Add conflict detection
- [ ] Implement sync strategies (last-write-wins, remote-wins, local-wins)
- [ ] Tests for push operations

**Deliverable:** Push synchronization working

### Phase 5.3: Pull Sync (Week 2-3)

**Goal:** Pull remote changes to local

- [ ] Implement SyncEngine.pull()
- [ ] Delta sync (only pull changes since last sync)
- [ ] Merge remote changes with local
- [ ] Handle deleted records
- [ ] Tests for pull operations

**Deliverable:** Bidirectional sync working

### Phase 5.4: Optimizations (Week 3)

**Goal:** Production-ready optimizations

- [ ] Batch operations (send multiple ops in one request)
- [ ] Queue persistence (save queue to LocalStorage/IndexedDB)
- [ ] Auto-sync on reconnect
- [ ] Configurable sync intervals
- [ ] Background sync (when idle)
- [ ] Performance tests

**Deliverable:** Production-ready SyncAdapter

### Phase 5.5: Examples & Docs (Week 3-4)

**Goal:** Documentation and examples

- [ ] Example: Offline-first todo app
- [ ] Example: React integration
- [ ] Example: Custom conflict resolution
- [ ] Update SYNC.md with real examples
- [ ] Update API.md with SyncAdapter API
- [ ] Migration guide (MemoryAdapter → SyncAdapter)

**Deliverable:** Complete documentation

## API Design

### Basic Usage

```typescript
import { SyncAdapter, MemoryAdapter, GraphQLAdapter } from 'orm-js';

// Create sync adapter
const syncAdapter = new SyncAdapter({
  local: new MemoryAdapter(),
  remote: new GraphQLAdapter({ endpoint: '/graphql' }),
  syncStrategy: 'last-write-wins',
  autoSync: true,
  syncInterval: 30000,  // Sync every 30 seconds
});

// Use with models
User.init({ /* fields */ });
User.setAdapter(syncAdapter);
User.objects = new Manager(User, syncAdapter);

// Works offline automatically
const user = await User.objects.create({
  name: 'John',
  email: 'john@example.com',
});
// Saved locally, queued for sync

// Manual sync
await syncAdapter.sync();

// Listen to sync events
signals.postSync.connect(async (sender, kwargs) => {
  console.log('Sync completed:', kwargs.result);
});

signals.syncConflict.connect(async (sender, kwargs) => {
  console.log('Conflict detected:', kwargs.local, kwargs.remote);
  // Return resolved version
  return kwargs.local;  // Use local version
});
```

### Advanced: Custom Conflict Resolution

```typescript
const syncAdapter = new SyncAdapter({
  local: new MemoryAdapter(),
  remote: new GraphQLAdapter({ endpoint: '/graphql' }),
  syncStrategy: 'custom',
  conflictResolver: {
    async resolve(local, remote, operation) {
      // Field-level merging
      return {
        ...remote,
        // Keep local changes for specific fields
        description: local.description,
        tags: [...local.tags, ...remote.tags],
      };
    }
  },
});
```

### Queue Management

```typescript
// Get pending operations
const pending = await syncAdapter.getPendingOperations();
console.log(`${pending.length} operations pending`);

// Get failed operations
const failed = await syncAdapter.getFailedOperations();

// Retry failed operations
await syncAdapter.retryFailed();

// Clear all operations
await syncAdapter.clearQueue();
```

## Testing Strategy

### 1. Unit Tests

- OperationQueue (add, get, update, remove, persistence)
- ConnectivityManager (online/offline detection, listeners)
- Conflict resolution strategies

### 2. Integration Tests

- Create → Queue → Sync → Verify
- Update → Queue → Sync → Conflict resolution
- Delete → Queue → Sync
- Pull sync → Merge changes
- Offline → Online → Auto sync
- Failed operations → Retry
- Queue persistence → Load after restart

### 3. Edge Cases

- Network error during sync
- Remote record deleted
- Local record deleted
- Concurrent updates
- Queue size limit
- Invalid operations

## Performance Considerations

### 1. Queue Size

- Limit queue to prevent memory issues
- Oldest operations pruned first
- Warning when approaching limit

### 2. Batch Operations

- Send multiple operations in single request
- Configurable batch size
- Reduces network overhead

### 3. Delta Sync

- Pull only changes since last sync
- Use timestamps or version numbers
- Requires backend support

### 4. Background Sync

- Use requestIdleCallback when available
- Configurable priority
- Pause during active user interaction

## Security Considerations

### 1. Queue Encryption

- Encrypt queue when persisting to storage
- Protect sensitive data in offline mode
- Use Web Crypto API

### 2. Authentication Tokens

- Handle token expiration during offline period
- Refresh tokens before sync
- Retry with new token if expired

### 3. Data Validation

- Validate data from remote before merging
- Prevent malicious data injection
- Use field validators

## Future Enhancements

### 1. Smart Sync

- Priority-based sync (important records first)
- Bandwidth-aware sync (reduce on slow connections)
- User-initiated sync only

### 2. Conflict UI

- Built-in UI component for conflict resolution
- Show side-by-side diff
- Allow field-level selection

### 3. Sync Analytics

- Track sync performance
- Monitor success/failure rates
- Alert on persistent failures

### 4. Multi-Device Sync

- Sync across multiple devices
- Operational transformation (OT)
- CRDT support

## References

- [Django ORM](https://docs.djangoproject.com/en/stable/topics/db/)
- [PouchDB Replication](https://pouchdb.com/guides/replication.html)
- [Offline First](https://offlinefirst.org/)
- [Background Sync API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)
- [CRDTs](https://crdt.tech/)
