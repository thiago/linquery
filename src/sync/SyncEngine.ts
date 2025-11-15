/**
 * SyncEngine - Manages synchronization between local and remote adapters
 */

import type { BackendAdapter, ModelClass } from '../types';
import type { OperationQueue, QueuedOperation } from './OperationQueue';
import { signals } from '../core/Signal';

export type SyncStrategy = 'last-write-wins' | 'remote-wins' | 'local-wins' | 'custom';

export interface ConflictResolver {
  resolve<T>(local: T, remote: T, operation: QueuedOperation): Promise<T | 'use-local' | 'use-remote' | 'skip'>;
}

export interface SyncResult {
  success: boolean;
  pushed: number; // Number of operations pushed
  pulled: number; // Number of records pulled
  conflicts: number; // Number of conflicts resolved
  failed: number; // Number of failed operations
  errors: Array<{
    operation: QueuedOperation;
    error: string;
  }>;
}

export interface SyncEngineOptions {
  local: BackendAdapter;
  remote: BackendAdapter;
  queue: OperationQueue;
  syncStrategy?: SyncStrategy;
  conflictResolver?: ConflictResolver;
  retryAttempts?: number;
  retryDelay?: number;
  modelRegistry?: Map<string, ModelClass>;
  idMapper?: IdMapper;
}

/**
 * Interface for ID mapping between local and remote IDs
 */
export interface IdMapper {
  getRemoteId(localId: unknown): unknown | undefined;
  setMapping(localId: unknown, remoteId: unknown): void;
  hasMapping(localId: unknown): boolean;
}

/**
 * Engine for synchronizing local and remote data
 */
export class SyncEngine {
  private _local: BackendAdapter;
  private _remote: BackendAdapter;
  private _queue: OperationQueue;
  private syncStrategy: SyncStrategy;
  private conflictResolver?: ConflictResolver;
  private retryAttempts: number;
  private retryDelay: number;
  private idMapper: IdMapper;
  private modelRegistry: Map<string, ModelClass>;
  private lastSyncTime: Map<string, number>; // Model name → timestamp

  constructor(options: SyncEngineOptions) {
    this._local = options.local;
    this._remote = options.remote;
    this._queue = options.queue;
    this.syncStrategy = options.syncStrategy || 'last-write-wins';
    this.conflictResolver = options.conflictResolver;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.idMapper = options.idMapper || this.createDefaultIdMapper();
    this.modelRegistry = options.modelRegistry || new Map();
    this.lastSyncTime = new Map();
  }

  /**
   * Create default ID mapper
   */
  private createDefaultIdMapper(): IdMapper {
    const map = new Map<unknown, unknown>();
    return {
      getRemoteId: (localId: unknown) => map.get(localId),
      setMapping: (localId: unknown, remoteId: unknown) => map.set(localId, remoteId),
      hasMapping: (localId: unknown) => map.has(localId),
    };
  }

  /**
   * Push local changes to remote
   */
  async push(): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      pushed: 0,
      pulled: 0,
      conflicts: 0,
      failed: 0,
      errors: [],
    };

    // Get pending operations
    const pending = this._queue.getPending();
    if (pending.length === 0) {
      return result;
    }

    // Emit preSync signal
    await signals.preSync.send(this, undefined, {
      operations: pending,
      direction: 'push',
    });

    // Process each operation
    for (const operation of pending) {
      // Mark as syncing
      this._queue.update(operation.id, { status: 'syncing' });

      try {
        // Process with retry logic
        await this._retryOperation(operation, async () => {
          await this._processOperation(operation);
        });

        // Mark as synced
        this._queue.update(operation.id, { status: 'synced' });
        result.pushed++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Mark as failed
        this._queue.update(operation.id, {
          status: 'failed',
          error: errorMessage,
          attempts: operation.attempts + 1,
        });

        result.failed++;
        result.success = false;
        result.errors.push({
          operation,
          error: errorMessage,
        });
      }
    }

    // Emit postSync signal
    await signals.postSync.send(this, undefined, {
      result,
      direction: 'push',
    });

    // Save queue state
    await this._queue.save();

    return result;
  }

  /**
   * Pull remote changes to local
   */
  async pull(): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      pushed: 0,
      pulled: 0,
      conflicts: 0,
      failed: 0,
      errors: [],
    };

    // Emit preSync signal
    await signals.preSync.send(this, undefined, {
      direction: 'pull',
    });

    // Pull changes for each registered model
    for (const [modelName, ModelCls] of this.modelRegistry.entries()) {
      try {
        const pullStats = await this._pullModel(ModelCls, modelName);
        result.pulled += pullStats.pulled;
        result.conflicts += pullStats.conflicts;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.success = false;
        result.failed++;
        result.errors.push({
          operation: {
            id: `pull-${modelName}`,
            type: 'update',
            modelName,
            data: {},
            timestamp: Date.now(),
            attempts: 0,
            status: 'failed',
          },
          error: errorMessage,
        });
      }
    }

    // Emit postSync signal
    await signals.postSync.send(this, undefined, {
      result,
      direction: 'pull',
    });

    return result;
  }

  /**
   * Pull changes for a specific model
   */
  private async _pullModel(ModelCls: ModelClass, modelName: string): Promise<{ pulled: number; conflicts: number }> {
    let pulled = 0;
    let conflicts = 0;

    // Get lastSyncTime for this model (for delta sync)
    const lastSync = this.lastSyncTime.get(modelName) || 0;

    // Fetch all records from remote
    // Note: In a real implementation, you'd pass lastSync as a filter
    // e.g., { updatedAt__gt: lastSync }
    const remoteRecords = await this._remote.find(ModelCls, {});

    for (const remoteRecord of remoteRecords) {
      const remoteId = (remoteRecord as any).id;
      const updatedAt = (remoteRecord as any).updatedAt || Date.now();

      // Skip if this record hasn't changed since last sync
      if (updatedAt <= lastSync) {
        continue;
      }

      // Find corresponding local record
      const localRecords = await this._local.find(ModelCls, { id: remoteId });

      if (localRecords.length === 0) {
        // Record doesn't exist locally - create it
        await this._local.create(ModelCls, remoteRecord as Record<string, unknown>);
        pulled++;
      } else {
        // Record exists - check for conflicts
        const localRecord = localRecords[0];
        const localUpdatedAt = (localRecord as any).updatedAt || 0;

        if (localUpdatedAt > updatedAt) {
          // Local is newer - potential conflict
          const resolved = await this._resolvePullConflict(localRecord, remoteRecord, ModelCls);

          if (resolved) {
            await this._local.update(ModelCls, { id: remoteId }, resolved as Record<string, unknown>);
            conflicts++;
            pulled++;
          }
        } else {
          // Remote is newer or same - just update local
          await this._local.update(ModelCls, { id: remoteId }, remoteRecord as Record<string, unknown>);
          pulled++;
        }
      }

      // Update ID mapping (remote ID is known)
      this.idMapper.setMapping(remoteId, remoteId);
    }

    // Update lastSyncTime for this model
    this.lastSyncTime.set(modelName, Date.now());

    return { pulled, conflicts };
  }

  /**
   * Resolve conflict during pull
   */
  private async _resolvePullConflict<T>(local: T, remote: T, ModelCls: ModelClass): Promise<T | null> {
    // Emit conflict signal
    await signals.syncConflict.send(this, undefined, {
      local,
      remote,
      modelName: ModelCls.name,
      strategy: this.syncStrategy,
      direction: 'pull',
    });

    // Use conflict resolver if provided
    if (this.conflictResolver) {
      const operation: QueuedOperation = {
        id: `pull-conflict-${Date.now()}`,
        type: 'update',
        modelName: ModelCls.name,
        data: remote as Record<string, unknown>,
        timestamp: Date.now(),
        attempts: 0,
        status: 'pending',
      };

      const result = await this.conflictResolver.resolve(local, remote, operation);
      if (result === 'use-local') return local;
      if (result === 'use-remote') return remote;
      if (result === 'skip') return null;
      return result;
    }

    // Use built-in strategy
    switch (this.syncStrategy) {
      case 'local-wins':
        return local;

      case 'remote-wins':
        return remote;

      case 'last-write-wins': {
        const localTime = (local as any).updatedAt || 0;
        const remoteTime = (remote as any).updatedAt || 0;
        return localTime > remoteTime ? local : remote;
      }

      case 'custom':
        throw new Error('Custom strategy requires conflictResolver');

      default:
        return remote;
    }
  }

  /**
   * Bidirectional sync (pull then push)
   *
   * This will be fully implemented in Phase 5.3
   */
  async sync(): Promise<SyncResult> {
    // TODO: Implement in Phase 5.3
    // - Pull remote changes first
    // - Then push local changes
    // - Combine results

    const pullResult = await this.pull();
    const pushResult = await this.push();

    return {
      success: pullResult.success && pushResult.success,
      pushed: pushResult.pushed,
      pulled: pullResult.pulled,
      conflicts: pullResult.conflicts + pushResult.conflicts,
      failed: pullResult.failed + pushResult.failed,
      errors: [...pullResult.errors, ...pushResult.errors],
    };
  }

  /**
   * Process a single queued operation
   */
  private async _processOperation(op: QueuedOperation): Promise<void> {
    // Get model class from registry
    const ModelCls = this.modelRegistry.get(op.modelName);
    if (!ModelCls) {
      throw new Error(`Model ${op.modelName} not found in registry`);
    }

    switch (op.type) {
      case 'create':
        await this._processCreate(op, ModelCls);
        break;

      case 'update':
        await this._processUpdate(op, ModelCls);
        break;

      case 'delete':
        await this._processDelete(op, ModelCls);
        break;

      default:
        throw new Error(`Unknown operation type: ${op.type}`);
    }
  }

  /**
   * Process a create operation
   */
  private async _processCreate(op: QueuedOperation, ModelCls: ModelClass): Promise<void> {
    // Remove local ID from data before sending to remote
    const { id: _id, ...dataWithoutId } = op.data;

    try {
      // Create in remote adapter
      const remoteInstance = await this._remote.create(ModelCls, dataWithoutId);

      // Map local ID to remote ID
      const remoteId = (remoteInstance as any).id;
      if (op.localId && remoteId) {
        this.idMapper.setMapping(op.localId, remoteId);

        // Note: We don't update the local record's ID because:
        // 1. Primary keys shouldn't be changed
        // 2. We have the ID mapping for future operations
        // 3. Local record keeps its local ID until explicitly synced

        // Store remote ID in operation
        this._queue.update(op.id, { remoteId });
      }
    } catch (error) {
      // Check if this is a conflict
      const isConflict = this._isConflictError(error);
      if (isConflict) {
        await this._handleConflict(op, ModelCls);
      } else {
        throw error;
      }
    }
  }

  /**
   * Process an update operation
   */
  private async _processUpdate(op: QueuedOperation, ModelCls: ModelClass): Promise<void> {
    // Use remote ID if available, otherwise try to find mapping
    let remoteId = op.remoteId;
    if (!remoteId && op.localId) {
      remoteId = this.idMapper.getRemoteId(op.localId);
    }

    if (!remoteId) {
      // No remote ID - this might be a local-only record that hasn't been synced yet
      // Try to create it instead
      await this._processCreate(op, ModelCls);
      return;
    }

    try {
      // Remove local ID from data before sending to remote
      const { id: _id, ...dataWithoutId } = op.data;

      // Update in remote adapter with remote ID
      await this._remote.update(ModelCls, { id: remoteId }, dataWithoutId);
    } catch (error) {
      // Check if this is a conflict
      const isConflict = this._isConflictError(error);
      if (isConflict) {
        await this._handleConflict(op, ModelCls);
      } else {
        throw error;
      }
    }
  }

  /**
   * Process a delete operation
   */
  private async _processDelete(op: QueuedOperation, ModelCls: ModelClass): Promise<void> {
    // Use remote ID if available, otherwise try to find mapping
    let remoteId = op.remoteId;
    if (!remoteId && op.localId) {
      remoteId = this.idMapper.getRemoteId(op.localId);
    }

    if (!remoteId) {
      // No remote ID - might be a local-only record, just skip
      return;
    }

    try {
      // Delete from remote adapter
      await this._remote.delete(ModelCls, { id: remoteId });

      // Delete from local adapter
      await this._local.delete(ModelCls, { id: op.localId });
    } catch (error) {
      // If record doesn't exist remotely, that's fine - delete locally
      if (this._isNotFoundError(error)) {
        await this._local.delete(ModelCls, { id: op.localId });
      } else {
        throw error;
      }
    }
  }

  /**
   * Check if error is a conflict error
   */
  private _isConflictError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('conflict') ||
        message.includes('version') ||
        message.includes('outdated') ||
        message.includes('concurrent')
      );
    }
    return false;
  }

  /**
   * Check if error is a not found error
   */
  private _isNotFoundError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('not found') || message.includes('does not exist') || message.includes('404');
    }
    return false;
  }

  /**
   * Handle conflict during sync
   */
  private async _handleConflict(op: QueuedOperation, ModelCls: ModelClass): Promise<void> {
    // Fetch current state from remote
    const remoteId = op.remoteId || this.idMapper.getRemoteId(op.localId);
    if (!remoteId) {
      throw new Error('Cannot resolve conflict without remote ID');
    }

    const remoteRecords = await this._remote.find(ModelCls, { id: remoteId });
    if (remoteRecords.length === 0) {
      throw new Error('Remote record not found during conflict resolution');
    }
    const remote = remoteRecords[0];

    // Fetch local state
    const localRecords = await this._local.find(ModelCls, { id: op.localId });
    if (localRecords.length === 0) {
      throw new Error('Local record not found during conflict resolution');
    }
    const local = localRecords[0];

    // Emit conflict signal
    await signals.syncConflict.send(this, undefined, {
      operation: op,
      local,
      remote,
      strategy: this.syncStrategy,
    });

    // Resolve conflict
    const resolved = await this._resolveConflict(local, remote, op);

    // Apply resolution
    await this._remote.update(ModelCls, { id: remoteId }, resolved as Record<string, unknown>);
    await this._local.update(ModelCls, { id: op.localId }, resolved as Record<string, unknown>);
  }

  /**
   * Resolve conflict between local and remote
   */
  private async _resolveConflict<T>(local: T, remote: T, operation: QueuedOperation): Promise<T> {
    // Use custom resolver if provided
    if (this.conflictResolver) {
      const result = await this.conflictResolver.resolve(local, remote, operation);
      if (result === 'use-local') return local;
      if (result === 'use-remote') return remote;
      if (result === 'skip') throw new Error('Conflict resolution skipped');
      return result;
    }

    // Use strategy
    switch (this.syncStrategy) {
      case 'local-wins':
        return local;

      case 'remote-wins':
        return remote;

      case 'last-write-wins':
        return this.lastWriteWins(local, remote, operation);

      case 'custom':
        throw new Error('Custom strategy requires conflictResolver');

      default:
        return remote;
    }
  }

  /**
   * Last-write-wins conflict resolution
   */
  private lastWriteWins<T>(local: T, remote: T, operation: QueuedOperation): T {
    const localTime = (local as any).updatedAt || operation.timestamp;
    const remoteTime = (remote as any).updatedAt || 0;

    return localTime > remoteTime ? local : remote;
  }

  /**
   * Retry failed operation with exponential backoff
   */
  private async _retryOperation(operation: QueuedOperation, fn: () => Promise<void>): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      try {
        // Update attempts counter
        this._queue.update(operation.id, { attempts: attempt + 1 });

        await fn();
        return; // Success
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.retryAttempts) {
          // Exponential backoff
          const delay = this.retryDelay * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    // All attempts failed
    throw lastError;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
