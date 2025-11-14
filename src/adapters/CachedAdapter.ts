import {
  BackendAdapter,
  ModelClass,
  QueryPlan,
  CompiledFilter,
} from '../types';
import { Signal } from '../core/Signal';
import { Model } from '../core/Model';
import { CharField, IntegerField } from '../core/Field';

/**
 * Read strategies for cached data
 */
export type ReadStrategy =
  | 'cache-first' // Return cache, no network call
  | 'network-first' // Try network first, fallback to cache
  | 'cache-then-network'; // Return cache immediately, update from network in background

/**
 * Write strategies for mutations
 */
export type WriteStrategy =
  | 'network-first' // Try network first, fallback to queue if offline
  | 'cache-first'; // Write to cache first, sync to network in background

/**
 * Queue operation types
 */
export type QueueOperationType = 'create' | 'update' | 'delete';

/**
 * Queued operation for CachedAdapter offline sync
 */
export interface CachedQueuedOperation {
  id: string;
  operation: QueueOperationType;
  modelName: string;
  data?: Record<string, unknown>;
  localId?: unknown;
  remoteId?: unknown;
  timestamp: number;
  retries: number;
  error?: string;
}

/**
 * Configuration options for CachedAdapter
 */
export interface CachedAdapterOptions {
  /** Cache backend adapter (e.g., DexieAdapter, LocalStorageAdapter) */
  cache: BackendAdapter;

  /** Remote backend adapter (e.g., GraphQLAdapter, RESTAdapter) */
  remote: BackendAdapter;

  /** Strategy for read operations */
  readStrategy?: ReadStrategy;

  /** Strategy for write operations */
  writeStrategy?: WriteStrategy;

  /** Enable offline queue for failed operations */
  enableOfflineQueue?: boolean;

  /** Maximum number of retries for queued operations */
  maxRetries?: number;

  /** Function to determine if the client is online */
  isOnline?: () => boolean | Promise<boolean>;

  /** Retry delay calculator (attempt number => milliseconds) */
  retryDelayMs?: (attempt: number) => number;
}

/**
 * Event data for cache operations
 */
export interface CacheEventData<T = unknown> {
  source: 'cache' | 'remote';
  model: string;
  data: T | T[];
  operation: 'read' | 'write' | 'delete';
}

/**
 * Event data for sync operations
 */
export interface SyncEventData {
  operation: CachedQueuedOperation;
  success: boolean;
  error?: Error;
}

/**
 * Internal model for storing queued operations
 */
class QueueModel extends Model {
  declare id: string;
  declare operation: string;
  declare modelName: string;
  declare data?: Record<string, unknown>;
  declare localId?: string;
  declare remoteId?: string;
  declare timestamp: number;
  declare retries: number;
  declare error?: string;
}

/**
 * CachedAdapter - Orchestrates cache and remote adapters with offline support
 *
 * This adapter combines a cache layer (e.g., Dexie, LocalStorage) with a remote
 * backend (e.g., GraphQL, REST) to provide offline-first capabilities with
 * configurable sync strategies.
 *
 * @example
 * ```typescript
 * const adapter = new CachedAdapter({
 *   cache: new DexieAdapter(db),
 *   remote: new GraphQLAdapter(url),
 *   readStrategy: 'cache-then-network',
 *   writeStrategy: 'network-first',
 *   enableOfflineQueue: true
 * });
 *
 * // Listen to sync events
 * adapter.signals.cacheHit.connect((event) => {
 *   console.log('Cache hit:', event);
 * });
 *
 * Post.objects.setAdapter(adapter);
 * ```
 */
export class CachedAdapter implements BackendAdapter {
  private cache: BackendAdapter;
  private remote: BackendAdapter;
  private readStrategy: ReadStrategy;
  private writeStrategy: WriteStrategy;
  private enableOfflineQueue: boolean;
  private maxRetries: number;
  private isOnlineFn: () => boolean | Promise<boolean>;
  private retryDelayFn: (attempt: number) => number;
  private syncInProgress = false;
  private connected = false;
  private modelRegistry = new Map<string, ModelClass>();

  // Signals for events
  public signals = {
    /** Emitted when data is fetched from cache */
    cacheHit: new Signal<CacheEventData>('cache_hit'),
    /** Emitted when data is fetched from network */
    networkFetch: new Signal<CacheEventData>('network_fetch'),
    /** Emitted when cache is updated from network */
    cacheUpdated: new Signal<CacheEventData>('cache_updated'),
    /** Emitted when an operation is queued for offline sync */
    operationQueued: new Signal<CachedQueuedOperation>('operation_queued'),
    /** Emitted when a queued operation is synced */
    operationSynced: new Signal<SyncEventData>('operation_synced'),
    /** Emitted when sync fails */
    syncFailed: new Signal<SyncEventData>('sync_failed'),
    /** Emitted when going online/offline */
    connectivityChanged: new Signal<{ online: boolean }>('connectivity_changed'),
  };

  constructor(options: CachedAdapterOptions) {
    this.cache = options.cache;
    this.remote = options.remote;
    this.readStrategy = options.readStrategy ?? 'cache-then-network';
    this.writeStrategy = options.writeStrategy ?? 'network-first';
    this.enableOfflineQueue = options.enableOfflineQueue ?? true;
    this.maxRetries = options.maxRetries ?? 3;
    this.isOnlineFn = options.isOnline ?? (() => true);
    this.retryDelayFn =
      options.retryDelayMs ?? ((attempt) => Math.min(1000 * 2 ** attempt, 30000));

    // Initialize the internal queue model if queue is enabled
    if (this.enableOfflineQueue) {
      this.initializeQueueModel();
    }
  }

  /**
   * Connect to adapters
   */
  async connect(): Promise<void> {
    if (this.connected) return;
    await Promise.all([this.cache.connect(), this.remote.connect()]);
    this.connected = true;
  }

  /**
   * Disconnect from adapters
   */
  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await Promise.all([this.cache.disconnect(), this.remote.disconnect()]);
    this.connected = false;
  }

  /**
   * Find records (delegates to list with converted filters)
   */
  async find<T>(model: ModelClass<T>, filters: Record<string, unknown>): Promise<T[]> {
    // Convert filters to QueryPlan
    const plan: QueryPlan = {
      model: model,
      filters: [],
      excludes: [],
      ordering: [],
      selectRelated: [],
      prefetchRelated: [],
    };

    // Simple conversion - treat all filters as exact matches
    for (const [key, value] of Object.entries(filters)) {
      plan.filters.push({
        field: key,
        lookup: 'exact',
        value,
      });
    }

    return this.list(model, plan);
  }

  /**
   * Initialize the internal QueueModel for storing offline operations
   */
  private initializeQueueModel(): void {
    // Only initialize if not already initialized
    try {
      QueueModel.getMeta();
    } catch {
      QueueModel.init(
        {
          id: new CharField({ maxLength: 100 }),
          operation: new CharField({ maxLength: 20 }),
          modelName: new CharField({ maxLength: 100 }),
          data: new CharField({ maxLength: 10000, required: false }),
          localId: new CharField({ maxLength: 100, required: false }),
          remoteId: new CharField({ maxLength: 100, required: false }),
          timestamp: new IntegerField(),
          retries: new IntegerField(),
          error: new CharField({ maxLength: 1000, required: false }),
        },
        {
          tableName: '__sync_queue__',
          adapter: this.cache,
        },
      );
    }
  }

  /**
   * Check if the client is currently online
   */
  private async isOnline(): Promise<boolean> {
    const result = this.isOnlineFn();
    return result instanceof Promise ? await result : result;
  }

  /**
   * Generate a unique ID for queue operations
   */
  private generateQueueId(): string {
    return `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if two objects have differences (for cache invalidation)
   */
  private hasChanged(
    cached: Record<string, unknown> | null,
    fresh: Record<string, unknown>,
  ): boolean {
    if (!cached) return true;

    // Compare updated_at if available
    if (
      'updated_at' in cached &&
      'updated_at' in fresh &&
      cached.updated_at !== fresh.updated_at
    ) {
      return true;
    }

    // Deep comparison (simplified)
    return JSON.stringify(cached) !== JSON.stringify(fresh);
  }

  /**
   * Queue an operation for later sync
   */
  private async queueOperation(
    operation: QueueOperationType,
    model: ModelClass,
    data?: Record<string, unknown>,
    localId?: unknown,
    remoteId?: unknown,
  ): Promise<void> {
    if (!this.enableOfflineQueue) return;

    const queuedOp: CachedQueuedOperation = {
      id: this.generateQueueId(),
      operation,
      modelName: this.getModelName(model),
      data,
      localId,
      remoteId,
      timestamp: Date.now(),
      retries: 0,
    };

    // Persist queue to cache
    await this.cache.create(
      QueueModel as unknown as ModelClass,
      queuedOp as unknown as Record<string, unknown>,
    );

    this.signals.operationQueued.send(this,queuedOp);
  }

  /**
   * Process the offline queue
   */
  public async processQueue(): Promise<void> {
    if (this.syncInProgress) return;
    if (!(await this.isOnline())) return;

    this.syncInProgress = true;

    try {
      const plan: QueryPlan = {
        model: QueueModel as unknown as ModelClass,
        filters: [],
        excludes: [],
        ordering: [{ field: 'timestamp', direction: 'asc' }],
        limit: undefined,
        offset: undefined,
        selectRelated: [],
        prefetchRelated: [],
      };

      const queuedOps = await this.cache.list(
        QueueModel as unknown as ModelClass,
        plan,
      );

      for (const op of queuedOps as unknown as CachedQueuedOperation[]) {
        await this.processCachedQueuedOperation(op);
      }
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Process a single queued operation
   */
  private async processCachedQueuedOperation(op: CachedQueuedOperation): Promise<void> {
    try {
      // Get the model class from registry
      const model = this.getModel(op.modelName);
      if (!model) {
        throw new Error(`Model ${op.modelName} not registered. Call adapter.registerModel() first.`);
      }

      // Try to sync to remote
      switch (op.operation) {
        case 'create':
          if (op.data) {
            await this.remote.create(model, op.data);
          }
          break;
        case 'update':
          if (op.remoteId && op.data) {
            await this.remote.update(model, { id: op.remoteId }, op.data);
          }
          break;
        case 'delete':
          if (op.remoteId) {
            await this.remote.delete(model, { id: op.remoteId });
          }
          break;
      }

      // Remove from queue on success
      await this.cache.delete(QueueModel as unknown as ModelClass, { id: op.id });
      await this.signals.operationSynced.send(this, { operation: op, success: true });
    } catch (error) {
      // Increment retry count
      op.retries += 1;
      op.error = error instanceof Error ? error.message : String(error);

      if (op.retries >= this.maxRetries) {
        // Max retries reached, remove from queue
        await this.cache.delete(QueueModel as unknown as ModelClass, { id: op.id });
        await this.signals.syncFailed.send(this, {
          operation: op,
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      } else {
        // Update retry count in queue
        await this.cache.update(
          QueueModel as unknown as ModelClass,
          { id: op.id },
          op as unknown as Record<string, unknown>,
        );

        // Schedule retry
        const delay = this.retryDelayFn(op.retries);
        setTimeout(() => this.processCachedQueuedOperation(op), delay);
      }
    }
  }

  /**
   * Get model name from ModelClass
   */
  private getModelName<T>(model: ModelClass<T>): string {
    return model.name;
  }

  /**
   * Register a model for queue processing
   */
  public registerModel<T>(model: ModelClass<T>): void {
    this.modelRegistry.set(model.name, model);
  }

  /**
   * Get a registered model by name
   */
  private getModel(modelName: string): ModelClass | undefined {
    return this.modelRegistry.get(modelName);
  }

  /**
   * Get a single record by ID
   */
  async get<T>(model: ModelClass<T>, id: unknown): Promise<T | null> {
    // Auto-register model for queue processing
    this.registerModel(model);
    const modelName = this.getModelName(model);

    switch (this.readStrategy) {
      case 'cache-first': {
        const cached = await this.cache.get(model, id);
        if (cached) {
          this.signals.cacheHit.send(this,{
            source: 'cache',
            model: modelName,
            data: cached,
            operation: 'read',
          });
        }
        return cached;
      }

      case 'network-first': {
        if (await this.isOnline()) {
          try {
            const fresh = await this.remote.get(model, id);
            if (fresh) {
              // Check if exists in cache, update or create
              const cached = await this.cache.get(model, id);
              if (cached) {
                await this.cache.update(model, { id }, fresh as Record<string, unknown>);
              } else {
                await this.cache.create(model, fresh as Record<string, unknown>);
              }
              await this.signals.networkFetch.send(this, {
                source: 'remote',
                model: modelName,
                data: fresh,
                operation: 'read',
              });
            }
            return fresh;
          } catch (error) {
            // Fallback to cache
            return await this.cache.get(model, id);
          }
        }
        return await this.cache.get(model, id);
      }

      case 'cache-then-network': {
        // Return cache immediately
        const cached = await this.cache.get(model, id);
        if (cached) {
          this.signals.cacheHit.send(this,{
            source: 'cache',
            model: modelName,
            data: cached,
            operation: 'read',
          });
        }

        // Fetch from network in background (defer to next tick)
        setTimeout(() => {
          (async () => {
            if (await this.isOnline()) {
              this.fetchAndUpdateCache(model, id).catch(() => {
                // Silently fail background fetch
              });
            }
          })();
        }, 0);

        return cached;
      }
    }
  }

  /**
   * Fetch from network and update cache in background
   */
  private async fetchAndUpdateCache<T>(
    model: ModelClass<T>,
    id: unknown,
  ): Promise<void> {
    try {
      const fresh = await this.remote.get(model, id);
      if (!fresh) return;

      const cached = await this.cache.get(model, id);
      if (
        this.hasChanged(
          cached as Record<string, unknown> | null,
          fresh as Record<string, unknown>,
        )
      ) {
        await this.cache.update(model, { id }, fresh as Record<string, unknown>);
        await this.signals.cacheUpdated.send(this, {
          source: 'remote',
          model: this.getModelName(model),
          data: fresh,
          operation: 'read',
        });
      }
    } catch (error) {
      // Silently fail background updates
    }
  }

  /**
   * List records with query plan
   */
  async list<T>(model: ModelClass<T>, plan: QueryPlan): Promise<T[]> {
    // Auto-register model for queue processing
    this.registerModel(model);
    const modelName = this.getModelName(model);

    switch (this.readStrategy) {
      case 'cache-first': {
        const cached = await this.cache.list(model, plan);
        this.signals.cacheHit.send(this,{
          source: 'cache',
          model: modelName,
          data: cached,
          operation: 'read',
        });
        return cached;
      }

      case 'network-first': {
        if (await this.isOnline()) {
          try {
            const fresh = await this.remote.list(model, plan);
            // Update cache with fresh data
            await this.updateCacheFromList(model, fresh);
            this.signals.networkFetch.send(this,{
              source: 'remote',
              model: modelName,
              data: fresh,
              operation: 'read',
            });
            return fresh;
          } catch (error) {
            // Fallback to cache
            return await this.cache.list(model, plan);
          }
        }
        return await this.cache.list(model, plan);
      }

      case 'cache-then-network': {
        // Return cache immediately
        const cached = await this.cache.list(model, plan);
        this.signals.cacheHit.send(this,{
          source: 'cache',
          model: modelName,
          data: cached,
          operation: 'read',
        });

        // Fetch from network in background (defer to next tick)
        setTimeout(() => {
          (async () => {
            if (await this.isOnline()) {
              this.fetchListAndUpdateCache(model, plan).catch(() => {
                // Silently fail background fetch
              });
            }
          })();
        }, 0);

        return cached;
      }
    }
  }

  /**
   * Fetch list from network and update cache in background
   */
  private async fetchListAndUpdateCache<T>(
    model: ModelClass<T>,
    plan: QueryPlan,
  ): Promise<void> {
    try {
      const fresh = await this.remote.list(model, plan);
      await this.updateCacheFromList(model, fresh);
      this.signals.cacheUpdated.send(this,{
        source: 'remote',
        model: this.getModelName(model),
        data: fresh,
        operation: 'read',
      });
    } catch (error) {
      // Silently fail background updates
    }
  }

  /**
   * Update cache with list of items (merge strategy)
   */
  private async updateCacheFromList<T>(
    model: ModelClass<T>,
    items: T[],
  ): Promise<void> {
    for (const item of items) {
      const record = item as Record<string, unknown>;
      if ('id' in record) {
        const cached = await this.cache.get(model, record.id);
        if (this.hasChanged(cached as Record<string, unknown> | null, record)) {
          if (cached) {
            await this.cache.update(model, { id: record.id }, record);
          } else {
            await this.cache.create(model, record);
          }
        }
      }
    }
  }

  /**
   * Create a new record
   */
  async create<T>(model: ModelClass<T>, data: Record<string, unknown>): Promise<T> {
    // Auto-register model for queue processing
    this.registerModel(model);
    const modelName = this.getModelName(model);

    if (this.writeStrategy === 'network-first') {
      if (await this.isOnline()) {
        try {
          const result = await this.remote.create(model, data);
          // Update cache with created record
          await this.cache.create(model, result as Record<string, unknown>);
          this.signals.networkFetch.send(this,{
            source: 'remote',
            model: modelName,
            data: result,
            operation: 'write',
          });
          return result;
        } catch (error) {
          // Queue for later if offline
          const localResult = await this.cache.create(model, data);
          await this.queueOperation(
            'create',
            model,
            data,
            (localResult as Record<string, unknown>).id,
          );
          return localResult;
        }
      } else {
        // Offline - write to cache and queue
        const localResult = await this.cache.create(model, data);
        await this.queueOperation(
          'create',
          model,
          data,
          (localResult as Record<string, unknown>).id,
        );
        return localResult;
      }
    } else {
      // cache-first
      const localResult = await this.cache.create(model, data);
      if (await this.isOnline()) {
        this.remote
          .create(model, data)
          .then((remoteResult) => {
            // Update cache with remote ID if different
            const localId = (localResult as Record<string, unknown>).id;
            const remoteId = (remoteResult as Record<string, unknown>).id;
            if (localId !== remoteId) {
              this.cache.delete(model, { id: localId });
              this.cache.create(model, remoteResult as Record<string, unknown>);
            }
          })
          .catch(() => {
            // Queue if network fails
            this.queueOperation(
              'create',
              model,
              data,
              (localResult as Record<string, unknown>).id,
            );
          });
      }
      return localResult;
    }
  }

  /**
   * Update records matching filters
   */
  async update<T>(
    model: ModelClass<T>,
    filters: Record<string, unknown>,
    data: Record<string, unknown>,
  ): Promise<void> {
    // Auto-register model for queue processing
    this.registerModel(model);
    const modelName = this.getModelName(model);

    if (this.writeStrategy === 'network-first') {
      if (await this.isOnline()) {
        try {
          await this.remote.update(model, filters, data);
          // Update cache
          await this.cache.update(model, filters, data);
          await this.signals.networkFetch.send(this, {
            source: 'remote',
            model: modelName,
            data,
            operation: 'write',
          });
        } catch (error) {
          // Queue for later if fails
          await this.cache.update(model, filters, data);
          await this.queueOperation('update', model, data, undefined, filters);
        }
      } else {
        // Offline - update cache and queue
        await this.cache.update(model, filters, data);
        await this.queueOperation('update', model, data, undefined, filters);
      }
    } else {
      // cache-first
      await this.cache.update(model, filters, data);
      if (await this.isOnline()) {
        this.remote.update(model, filters, data).catch(() => {
          // Queue if network fails
          this.queueOperation('update', model, data, undefined, filters);
        });
      }
    }
  }

  /**
   * Delete records matching filters
   */
  async delete<T>(model: ModelClass<T>, filters: Record<string, unknown>): Promise<void> {
    // Auto-register model for queue processing
    this.registerModel(model);
    const modelName = this.getModelName(model);

    if (this.writeStrategy === 'network-first') {
      if (await this.isOnline()) {
        try {
          await this.remote.delete(model, filters);
          // Delete from cache
          await this.cache.delete(model, filters);
          await this.signals.networkFetch.send(this, {
            source: 'remote',
            model: modelName,
            data: filters,
            operation: 'delete',
          });
        } catch (error) {
          // Queue for later if fails
          await this.cache.delete(model, filters);
          await this.queueOperation('delete', model, undefined, undefined, filters);
        }
      } else {
        // Offline - delete from cache and queue
        await this.cache.delete(model, filters);
        await this.queueOperation('delete', model, undefined, undefined, filters);
      }
    } else {
      // cache-first
      await this.cache.delete(model, filters);
      if (await this.isOnline()) {
        this.remote.delete(model, filters).catch(() => {
          // Queue if network fails
          this.queueOperation('delete', model, undefined, undefined, filters);
        });
      }
    }
  }

  /**
   * Count records matching the query plan
   */
  async count<T>(model: ModelClass<T>, plan: QueryPlan): Promise<number> {
    // For count, we prefer cache unless network-first
    if (this.readStrategy === 'network-first' && (await this.isOnline())) {
      try {
        return await this.remote.count(model, plan);
      } catch (error) {
        return await this.cache.count(model, plan);
      }
    }
    return await this.cache.count(model, plan);
  }

  /**
   * Execute a raw query (delegates to remote if online, cache otherwise)
   */
  async executeRaw<T>(
    model: ModelClass<T>,
    query: string | object,
    params?: unknown[],
  ): Promise<T[]> {
    if (await this.isOnline()) {
      try {
        return this.remote.executeRaw ? await this.remote.executeRaw(model, query, params) : [];
      } catch (error) {
        return this.cache.executeRaw ? await this.cache.executeRaw(model, query, params) : [];
      }
    }
    return this.cache.executeRaw ? await this.cache.executeRaw(model, query, params) : [];
  }

  /**
   * Compile a filter to backend-specific format
   */
  compileFilter(filter: Record<string, unknown>): CompiledFilter {
    // Use remote adapter's filter compilation if available
    if (this.remote.compileFilter) {
      return this.remote.compileFilter(filter);
    }
    // Fallback: return a simple filter
    return {
      field: Object.keys(filter)[0] || '',
      lookup: 'exact',
      value: Object.values(filter)[0],
    };
  }
}
