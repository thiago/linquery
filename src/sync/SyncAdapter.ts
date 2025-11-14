/**
 * SyncAdapter - Offline-first adapter with sync capabilities
 */

import type { BackendAdapter, ModelClass, QueryPlan } from '../types';
import { OperationQueue, type OperationQueueOptions } from './OperationQueue';
import { ConnectivityManager, type ConnectivityManagerOptions } from './ConnectivityManager';
import { SyncEngine, type SyncStrategy, type ConflictResolver, type SyncResult } from './SyncEngine';

export interface SyncAdapterOptions {
  // Required adapters
  local: BackendAdapter;
  remote: BackendAdapter;

  // Sync strategy
  syncStrategy?: SyncStrategy;
  conflictResolver?: ConflictResolver;

  // Sync behavior
  autoSync?: boolean; // Auto sync when online (default: true)
  syncInterval?: number; // Auto sync interval in ms (default: 30000)
  retryAttempts?: number; // Retry failed operations (default: 3)
  retryDelay?: number; // Delay between retries in ms (default: 1000)

  // Queue options
  queueOptions?: OperationQueueOptions;

  // Connectivity options
  connectivityOptions?: ConnectivityManagerOptions;
}

/**
 * Adapter that provides offline-first functionality with sync
 */
export class SyncAdapter implements BackendAdapter {
  private local: BackendAdapter;
  private remote: BackendAdapter;
  private queue: OperationQueue;
  private connectivity: ConnectivityManager;
  private engine: SyncEngine;
  private autoSync: boolean;
  private syncInterval: number;
  private syncIntervalId?: ReturnType<typeof setInterval>;
  private localIdCounter = 1;
  private localIdMap = new Map<unknown, unknown>(); // local ID → remote ID
  private modelRegistry = new Map<string, ModelClass>(); // model name → ModelClass

  constructor(options: SyncAdapterOptions) {
    this.local = options.local;
    this.remote = options.remote;
    this.autoSync = options.autoSync !== false;
    this.syncInterval = options.syncInterval || 30000;

    // Initialize queue
    this.queue = new OperationQueue(options.queueOptions);

    // Initialize connectivity manager
    this.connectivity = new ConnectivityManager(options.connectivityOptions);

    // Create ID mapper
    const idMapper = {
      getRemoteId: (localId: unknown) => this.localIdMap.get(localId),
      setMapping: (localId: unknown, remoteId: unknown) => this.localIdMap.set(localId, remoteId),
      hasMapping: (localId: unknown) => this.localIdMap.has(localId),
    };

    // Initialize sync engine
    this.engine = new SyncEngine({
      local: this.local,
      remote: this.remote,
      queue: this.queue,
      syncStrategy: options.syncStrategy,
      conflictResolver: options.conflictResolver,
      retryAttempts: options.retryAttempts,
      retryDelay: options.retryDelay,
      idMapper,
      modelRegistry: this.modelRegistry,
    });

    // Setup connectivity listener
    this.connectivity.onChange((online) => this.handleConnectivityChange(online));
  }

  /**
   * Register a model class for sync operations
   */
  registerModel(model: ModelClass): void {
    this.modelRegistry.set(model.name, model);
  }

  /**
   * Register multiple model classes
   */
  registerModels(models: ModelClass[]): void {
    models.forEach((model) => this.registerModel(model));
  }

  /**
   * Connect to both adapters
   */
  async connect(): Promise<void> {
    // Connect to local adapter
    await this.local.connect();

    // Load persisted queue
    await this.queue.load();

    // Try to connect to remote (don't fail if offline)
    try {
      await this.remote.connect();
    } catch (error) {
      console.warn('Failed to connect to remote adapter:', error);
    }

    // Start auto-sync if enabled and online
    if (this.autoSync && this.connectivity.getOnlineStatus()) {
      this.startAutoSync();
    }
  }

  /**
   * Disconnect from both adapters
   */
  async disconnect(): Promise<void> {
    // Stop auto-sync
    this.stopAutoSync();

    // Save queue
    await this.queue.save();

    // Disconnect from both adapters
    await Promise.all([
      this.local.disconnect(),
      this.remote.disconnect().catch(() => {}), // Ignore remote disconnect errors
    ]);

    // Cleanup connectivity manager
    this.connectivity.destroy();
  }

  /**
   * Generate local ID for offline creates
   */
  private generateLocalId(): string {
    return `local-${Date.now()}-${this.localIdCounter++}`;
  }

  /**
   * Create record (saves locally and queues for sync)
   */
  async create<T>(model: ModelClass<T>, data: Record<string, unknown>): Promise<T> {
    // Auto-register model if not already registered
    if (!this.modelRegistry.has(model.name)) {
      this.registerModel(model);
    }

    // Generate local ID
    const localId = this.generateLocalId();
    const localData = { ...data, id: localId };

    // Save to local adapter
    const instance = await this.local.create(model, localData);

    // Queue operation for sync
    this.queue.add({
      type: 'create',
      modelName: model.name,
      data,
      localId,
    });

    // Trigger sync if autoSync is enabled and online
    if (this.autoSync && this.connectivity.getOnlineStatus()) {
      this.triggerSync();
    }

    return instance;
  }

  /**
   * Find records (queries local adapter only)
   */
  async find<T>(model: ModelClass<T>, filters: Record<string, unknown>): Promise<T[]> {
    // Always query local adapter for fast response
    const results = await this.local.find(model, filters);
    // Ensure we always return an array
    return Array.isArray(results) ? results : [results];
  }

  /**
   * Get a single record by ID
   */
  async get<T>(model: ModelClass<T>, id: unknown): Promise<T | null> {
    return await this.local.get(model, id);
  }

  /**
   * List records with query plan
   */
  async list<T>(model: ModelClass<T>, plan: QueryPlan): Promise<T[]> {
    return await this.local.list(model, plan);
  }

  /**
   * Count records matching query plan
   */
  async count<T>(model: ModelClass<T>, query: QueryPlan): Promise<number> {
    return await this.local.count(model, query);
  }

  /**
   * Update record (updates locally and queues for sync)
   */
  async update<T>(
    model: ModelClass<T>,
    filters: Record<string, unknown>,
    data: Record<string, unknown>
  ): Promise<void> {
    // Auto-register model if not already registered
    if (!this.modelRegistry.has(model.name)) {
      this.registerModel(model);
    }

    // Update in local adapter
    await this.local.update(model, filters, data);

    // Queue operation for sync
    const id = filters.id;
    if (id) {
      this.queue.add({
        type: 'update',
        modelName: model.name,
        data: { ...data, id },
        localId: id,
        remoteId: this.localIdMap.get(id),
      });

      // Trigger sync if autoSync is enabled and online
      if (this.autoSync && this.connectivity.getOnlineStatus()) {
        this.triggerSync();
      }
    }
  }

  /**
   * Delete record (soft delete locally and queues for sync)
   */
  async delete<T>(model: ModelClass<T>, filters: Record<string, unknown>): Promise<void> {
    // Auto-register model if not already registered
    if (!this.modelRegistry.has(model.name)) {
      this.registerModel(model);
    }

    // Mark as deleted in local (could implement soft delete)
    // For now, we'll keep it in local until synced
    const id = filters.id;
    if (id) {
      this.queue.add({
        type: 'delete',
        modelName: model.name,
        data: { id },
        localId: id,
        remoteId: this.localIdMap.get(id),
      });

      // Don't delete from local yet - wait for successful sync
      // This allows retry if sync fails

      // Trigger sync if autoSync is enabled and online
      if (this.autoSync && this.connectivity.getOnlineStatus()) {
        this.triggerSync();
      }
    }
  }

  // Note: count() and exists() are optional in BackendAdapter
  // They will be implemented in a future phase with proper QueryPlan support

  /**
   * Manual sync operation
   */
  async sync(): Promise<SyncResult> {
    return this.engine.sync();
  }

  /**
   * Push local changes to remote
   */
  async push(): Promise<SyncResult> {
    return this.engine.push();
  }

  /**
   * Pull remote changes to local
   */
  async pull(): Promise<SyncResult> {
    return this.engine.pull();
  }

  /**
   * Get pending operations
   */
  getPendingOperations() {
    return this.queue.getPending();
  }

  /**
   * Get failed operations
   */
  getFailedOperations() {
    return this.queue.getFailed();
  }

  /**
   * Retry failed operations
   */
  async retryFailed(): Promise<SyncResult> {
    // Get failed operations
    const failed = this.queue.getFailed();

    // Reset status to pending
    failed.forEach((op) => {
      this.queue.update(op.id, { status: 'pending', attempts: 0 });
    });

    // Trigger sync
    return this.push();
  }

  /**
   * Clear all operations from queue
   */
  clearQueue(): void {
    this.queue.clear();
  }

  /**
   * Clear synced operations
   */
  clearSynced(): void {
    this.queue.clearSynced();
  }

  /**
   * Get queue statistics
   */
  getQueueStats() {
    return this.queue.getStats();
  }

  /**
   * Check if online
   */
  isOnline(): boolean {
    return this.connectivity.getOnlineStatus();
  }

  /**
   * Check if offline
   */
  isOffline(): boolean {
    return this.connectivity.isOffline();
  }

  /**
   * Wait for online status
   */
  async waitForOnline(timeout?: number): Promise<boolean> {
    return this.connectivity.waitForOnline(timeout);
  }

  /**
   * Handle connectivity change
   */
  private handleConnectivityChange(online: boolean): void {
    if (online) {
      console.log('Back online, starting auto-sync');

      // Start auto-sync
      if (this.autoSync) {
        this.startAutoSync();

        // Trigger immediate sync
        this.triggerSync();
      }
    } else {
      console.log('Gone offline');

      // Stop auto-sync
      this.stopAutoSync();
    }
  }

  /**
   * Start auto-sync interval
   */
  private startAutoSync(): void {
    if (this.syncIntervalId) {
      return; // Already running
    }

    this.syncIntervalId = setInterval(() => {
      this.triggerSync();
    }, this.syncInterval);
  }

  /**
   * Stop auto-sync interval
   */
  private stopAutoSync(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = undefined;
    }
  }

  /**
   * Trigger sync operation (debounced)
   */
  private triggerSync(): void {
    // Fire and forget - don't wait for sync to complete
    this.sync().catch((error) => {
      console.error('Sync failed:', error);
    });
  }
}
