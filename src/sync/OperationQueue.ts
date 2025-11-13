/**
 * OperationQueue - Manages pending sync operations
 */

/// <reference path="./browser-globals.d.ts" />

export type OperationType = 'create' | 'update' | 'delete';
export type OperationStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface QueuedOperation {
  id: string; // Unique operation ID
  type: OperationType; // Operation type
  modelName: string; // Model class name
  data: Record<string, unknown>; // Operation data
  timestamp: number; // When operation was queued
  attempts: number; // Number of sync attempts
  status: OperationStatus; // Current status
  error?: string; // Last error message
  localId?: unknown; // Local ID (for creates)
  remoteId?: unknown; // Remote ID (after sync)
}

export interface OperationQueueOptions {
  maxSize?: number; // Max operations in queue (default: 1000)
  persistKey?: string; // LocalStorage key for persistence
  persist?: boolean; // Enable persistence (default: true)
}

/**
 * Queue for managing sync operations
 */
export class OperationQueue {
  private operations: Map<string, QueuedOperation> = new Map();
  private maxSize: number;
  private persistKey: string;
  private persist: boolean;
  private nextId = 1;

  constructor(options: OperationQueueOptions = {}) {
    this.maxSize = options.maxSize || 1000;
    this.persistKey = options.persistKey || 'orm-sync-queue';
    this.persist = options.persist !== false;
  }

  /**
   * Generate unique operation ID
   */
  private generateId(): string {
    return `op-${Date.now()}-${this.nextId++}`;
  }

  /**
   * Add operation to queue
   */
  add(operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'attempts' | 'status'>): string {
    // Check queue size limit
    if (this.operations.size >= this.maxSize) {
      // Remove oldest pending operation
      const oldest = this.getOldestPending();
      if (oldest) {
        this.operations.delete(oldest.id);
      } else {
        throw new Error(`Queue size limit reached (${this.maxSize})`);
      }
    }

    const id = this.generateId();
    const queuedOp: QueuedOperation = {
      ...operation,
      id,
      timestamp: Date.now(),
      attempts: 0,
      status: 'pending',
    };

    this.operations.set(id, queuedOp);

    // Persist to storage
    if (this.persist) {
      this.saveSync();
    }

    return id;
  }

  /**
   * Get operation by ID
   */
  get(id: string): QueuedOperation | undefined {
    return this.operations.get(id);
  }

  /**
   * Get all operations
   */
  getAll(): QueuedOperation[] {
    return Array.from(this.operations.values());
  }

  /**
   * Get pending operations (ordered by timestamp)
   */
  getPending(): QueuedOperation[] {
    return this.getAll()
      .filter((op) => op.status === 'pending')
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get failed operations
   */
  getFailed(): QueuedOperation[] {
    return this.getAll()
      .filter((op) => op.status === 'failed')
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get syncing operations
   */
  getSyncing(): QueuedOperation[] {
    return this.getAll().filter((op) => op.status === 'syncing');
  }

  /**
   * Get synced operations
   */
  getSynced(): QueuedOperation[] {
    return this.getAll().filter((op) => op.status === 'synced');
  }

  /**
   * Get oldest pending operation
   */
  private getOldestPending(): QueuedOperation | undefined {
    const pending = this.getPending();
    return pending.length > 0 ? pending[0] : undefined;
  }

  /**
   * Update operation
   */
  update(id: string, updates: Partial<QueuedOperation>): void {
    const operation = this.operations.get(id);
    if (!operation) {
      throw new Error(`Operation ${id} not found`);
    }

    this.operations.set(id, { ...operation, ...updates });

    // Persist to storage
    if (this.persist) {
      this.saveSync();
    }
  }

  /**
   * Remove operation from queue
   */
  remove(id: string): void {
    this.operations.delete(id);

    // Persist to storage
    if (this.persist) {
      this.saveSync();
    }
  }

  /**
   * Clear all operations
   */
  clear(): void {
    this.operations.clear();

    // Persist to storage
    if (this.persist) {
      this.saveSync();
    }
  }

  /**
   * Clear synced operations
   */
  clearSynced(): void {
    const synced = this.getSynced();
    synced.forEach((op) => this.operations.delete(op.id));

    // Persist to storage
    if (this.persist) {
      this.saveSync();
    }
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.operations.size;
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.operations.size === 0;
  }

  /**
   * Save queue to storage (synchronous)
   */
  private saveSync(): void {
    if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
      return;
    }

    try {
      const storage = globalThis.localStorage as Storage;
      const data = Array.from(this.operations.values());
      storage.setItem(this.persistKey, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to persist operation queue:', error);
    }
  }

  /**
   * Save queue to storage (async)
   */
  async save(): Promise<void> {
    this.saveSync();
  }

  /**
   * Load queue from storage
   */
  async load(): Promise<void> {
    if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
      return;
    }

    try {
      const storage = globalThis.localStorage as Storage;
      const data = storage.getItem(this.persistKey);
      if (!data) {
        return;
      }

      const operations = JSON.parse(data) as QueuedOperation[];
      this.operations.clear();

      operations.forEach((op) => {
        this.operations.set(op.id, op);
        // Update nextId to avoid collisions
        const idParts = op.id.split('-');
        if (idParts.length === 3) {
          const id = parseInt(idParts[2] ?? '0', 10);
          if (id >= this.nextId) {
            this.nextId = id + 1;
          }
        }
      });
    } catch (error) {
      console.error('Failed to load operation queue:', error);
    }
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    total: number;
    pending: number;
    syncing: number;
    synced: number;
    failed: number;
  } {
    return {
      total: this.operations.size,
      pending: this.getPending().length,
      syncing: this.getSyncing().length,
      synced: this.getSynced().length,
      failed: this.getFailed().length,
    };
  }
}
