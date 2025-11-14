import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CachedAdapter, ReadStrategy, WriteStrategy } from '../../src/adapters/CachedAdapter';
import { MemoryAdapter } from '../../src/adapters/MemoryAdapter';
import { Model } from '../../src/core/Model';
import { Manager } from '../../src/core/Manager';
import { CharField, IntegerField } from '../../src/core/Field';
import { BackendAdapter } from '../../src/types';

// Test model
class Post extends Model {
  declare id?: number;
  declare title: string;
  declare content: string;
  declare updated_at: number;

  static objects: Manager<Post>;
}

// Mock remote adapter that simulates network calls
class MockRemoteAdapter extends MemoryAdapter {
  public networkDelay = 100;
  public shouldFail = false;
  public callCount = {
    get: 0,
    list: 0,
    create: 0,
    update: 0,
    delete: 0,
  };

  async get(...args: Parameters<BackendAdapter['get']>) {
    this.callCount.get++;
    if (this.shouldFail) throw new Error('Network error');
    await this.delay();
    return super.get(...args);
  }

  async list(...args: Parameters<BackendAdapter['list']>) {
    this.callCount.list++;
    if (this.shouldFail) throw new Error('Network error');
    await this.delay();
    return super.list(...args);
  }

  async create(...args: Parameters<BackendAdapter['create']>) {
    this.callCount.create++;
    if (this.shouldFail) throw new Error('Network error');
    await this.delay();
    return super.create(...args);
  }

  async update(...args: Parameters<BackendAdapter['update']>) {
    this.callCount.update++;
    if (this.shouldFail) throw new Error('Network error');
    await this.delay();
    return super.update(...args);
  }

  async delete(...args: Parameters<BackendAdapter['delete']>) {
    this.callCount.delete++;
    if (this.shouldFail) throw new Error('Network error');
    await this.delay();
    return super.delete(...args);
  }

  private delay() {
    return new Promise((resolve) => setTimeout(resolve, this.networkDelay));
  }

  resetCallCount() {
    this.callCount = {
      get: 0,
      list: 0,
      create: 0,
      update: 0,
      delete: 0,
    };
  }
}

describe('CachedAdapter', () => {
  let cacheAdapter: MemoryAdapter;
  let remoteAdapter: MockRemoteAdapter;
  let isOnline: boolean;

  beforeEach(() => {
    // Create fresh adapters for each test
    cacheAdapter = new MemoryAdapter();
    remoteAdapter = new MockRemoteAdapter();
    isOnline = true;
    remoteAdapter.shouldFail = false;
    remoteAdapter.resetCallCount();

    // Re-initialize Post model with fresh adapter
    // We need to force re-initialization by catching the error
    try {
      Post.init(
        {
          id: new IntegerField({ primaryKey: true }),
          title: new CharField({ maxLength: 200 }),
          content: new CharField({ maxLength: 1000 }),
          updated_at: new IntegerField(),
        },
        {
          modelName: 'Post',
          adapter: cacheAdapter,
        },
      );
    } catch {
      // Model already initialized, just set the adapter
      Post.objects.setAdapter(cacheAdapter);
    }
  });

  const createAdapter = (
    readStrategy: ReadStrategy = 'cache-then-network',
    writeStrategy: WriteStrategy = 'network-first',
  ) => {
    return new CachedAdapter({
      cache: cacheAdapter,
      remote: remoteAdapter,
      readStrategy,
      writeStrategy,
      enableOfflineQueue: true,
      isOnline: () => isOnline,
      maxRetries: 3,
    });
  };

  describe('Read Strategies', () => {
    describe('cache-first', () => {
      it('should return data from cache without calling remote', async () => {
        const adapter = createAdapter('cache-first');

        // Add data to cache
        await cacheAdapter.create(Post, {
          id: 1,
          title: 'Cached Post',
          content: 'Content',
          updated_at: Date.now(),
        });

        const result = await adapter.get(Post, 1);

        expect(result).toMatchObject({ id: 1, title: 'Cached Post' });
        expect(remoteAdapter.callCount.get).toBe(0);
      });

      it('should return null if not in cache', async () => {
        const adapter = createAdapter('cache-first');

        const result = await adapter.get(Post, 999);

        expect(result).toBeNull();
        expect(remoteAdapter.callCount.get).toBe(0);
      });

      it('should emit cacheHit signal', async () => {
        const adapter = createAdapter('cache-first');

        const cacheHitSpy = vi.fn();
        adapter.signals.cacheHit.connect(cacheHitSpy);

        await cacheAdapter.create(Post, {
          id: 1,
          title: 'Post',
          content: 'Content',
          updated_at: Date.now(),
        });

        await adapter.get(Post, 1);

        expect(cacheHitSpy).toHaveBeenCalled();
        const call = cacheHitSpy.mock.calls[0];
        expect(call[1]).toMatchObject({
          source: 'cache',
          model: 'Post',
          operation: 'read',
        });
      });
    });

    describe('network-first', () => {
      it('should fetch from remote when online', async () => {
        const adapter = createAdapter('network-first');

        // Add data to remote
        await remoteAdapter.create(Post, {
          id: 1,
          title: 'Remote Post',
          content: 'Content',
          updated_at: Date.now(),
        });

        remoteAdapter.resetCallCount();
        const result = await adapter.get(Post, 1);

        expect(result).toMatchObject({ id: 1, title: 'Remote Post' });
        expect(remoteAdapter.callCount.get).toBe(1);
      });

      it('should update cache with remote data', async () => {
        const adapter = createAdapter('network-first');

        await remoteAdapter.create(Post, {
          id: 1,
          title: 'Remote Post',
          content: 'Content',
          updated_at: Date.now(),
        });

        await adapter.get(Post, 1);

        // Check cache was updated
        const cached = await cacheAdapter.get(Post, 1);
        expect(cached).toMatchObject({ id: 1, title: 'Remote Post' });
      });

      it('should fallback to cache when offline', async () => {
        const adapter = createAdapter('network-first');

        await cacheAdapter.create(Post, {
          id: 1,
          title: 'Cached Post',
          content: 'Content',
          updated_at: Date.now(),
        });

        isOnline = false;
        const result = await adapter.get(Post, 1);

        expect(result).toMatchObject({ id: 1, title: 'Cached Post' });
        expect(remoteAdapter.callCount.get).toBe(0);
      });

      it('should fallback to cache when remote fails', async () => {
        const adapter = createAdapter('network-first');

        await cacheAdapter.create(Post, {
          id: 1,
          title: 'Cached Post',
          content: 'Content',
          updated_at: Date.now(),
        });

        remoteAdapter.shouldFail = true;
        const result = await adapter.get(Post, 1);

        expect(result).toMatchObject({ id: 1, title: 'Cached Post' });
      });
    });

    describe('cache-then-network', () => {
      it('should return cache immediately', async () => {
        const adapter = createAdapter('cache-then-network');

        await cacheAdapter.create(Post, {
          id: 1,
          title: 'Cached Post',
          content: 'Content',
          updated_at: 1000,
        });

        const result = await adapter.get(Post, 1);

        // Should return immediately from cache
        expect(result).toMatchObject({ id: 1, title: 'Cached Post' });
        expect(remoteAdapter.callCount.get).toBe(0);
      });

      it('should fetch from remote in background', async () => {
        const adapter = createAdapter('cache-then-network');

        await cacheAdapter.create(Post, {
          id: 1,
          title: 'Cached Post',
          content: 'Content',
          updated_at: 1000,
        });

        await remoteAdapter.create(Post, {
          id: 1,
          title: 'Remote Post',
          content: 'Updated Content',
          updated_at: 2000,
        });

        await adapter.get(Post, 1);

        // Wait for background fetch
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(remoteAdapter.callCount.get).toBe(1);
      });

      it('should emit cacheUpdated signal when data changes', async () => {
        const adapter = createAdapter('cache-then-network');

        const cacheUpdatedSpy = vi.fn();
        adapter.signals.cacheUpdated.connect(cacheUpdatedSpy);

        await cacheAdapter.create(Post, {
          id: 1,
          title: 'Old Title',
          content: 'Content',
          updated_at: 1000,
        });

        await remoteAdapter.create(Post, {
          id: 1,
          title: 'New Title',
          content: 'Content',
          updated_at: 2000,
        });

        await adapter.get(Post, 1);

        // Wait for background update
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(cacheUpdatedSpy).toHaveBeenCalled();
        const call = cacheUpdatedSpy.mock.calls[0];
        expect(call[1]).toMatchObject({
          source: 'remote',
          model: 'Post',
          operation: 'read',
        });
      });

      it('should not emit cacheUpdated if data unchanged', async () => {
        const adapter = createAdapter('cache-then-network');

        const cacheUpdatedSpy = vi.fn();
        adapter.signals.cacheUpdated.connect(cacheUpdatedSpy);

        const data = {
          id: 1,
          title: 'Same Title',
          content: 'Content',
          updated_at: 1000,
        };

        await cacheAdapter.create(Post, data);
        await remoteAdapter.create(Post, data);

        await adapter.get(Post, 1);

        // Wait for background update
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(cacheUpdatedSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('Write Strategies', () => {
    describe('network-first (create)', () => {
      it('should create on remote first when online', async () => {
        const adapter = createAdapter('cache-then-network', 'network-first');

        const result = await adapter.create(Post, {
          title: 'New Post',
          content: 'Content',
          updated_at: Date.now(),
        });

        expect(result).toMatchObject({ title: 'New Post' });
        expect(remoteAdapter.callCount.create).toBe(1);

        // Should also be in cache
        const cached = await cacheAdapter.get(Post, result.id);
        expect(cached).toMatchObject({ title: 'New Post' });
      });

      it('should queue operation when offline', async () => {
        const adapter = createAdapter('cache-then-network', 'network-first');

        const queuedSpy = vi.fn();
        adapter.signals.operationQueued.connect(queuedSpy);

        isOnline = false;

        const result = await adapter.create(Post, {
          title: 'Offline Post',
          content: 'Content',
          updated_at: Date.now(),
        });

        expect(result).toMatchObject({ title: 'Offline Post' });
        expect(remoteAdapter.callCount.create).toBe(0);
        expect(queuedSpy).toHaveBeenCalled();
        const call = queuedSpy.mock.calls[0];
        expect(call[1]).toMatchObject({
          operation: 'create',
          modelName: 'Post',
        });
      });

      it('should queue operation when remote fails', async () => {
        const adapter = createAdapter('cache-then-network', 'network-first');

        const queuedSpy = vi.fn();
        adapter.signals.operationQueued.connect(queuedSpy);

        remoteAdapter.shouldFail = true;

        const result = await adapter.create(Post, {
          title: 'Failed Post',
          content: 'Content',
          updated_at: Date.now(),
        });

        expect(result).toMatchObject({ title: 'Failed Post' });
        expect(queuedSpy).toHaveBeenCalled();
      });
    });

    describe('network-first (update)', () => {
      it('should update on remote first when online', async () => {
        const adapter = createAdapter('cache-then-network', 'network-first');

        // Create initial post
        const post = await remoteAdapter.create(Post, {
          id: 1,
          title: 'Original',
          content: 'Content',
          updated_at: Date.now(),
        });

        await cacheAdapter.create(Post, post as Record<string, unknown>);
        remoteAdapter.resetCallCount();

        await adapter.update(Post, { id: 1 }, { title: 'Updated' });

        expect(remoteAdapter.callCount.update).toBe(1);

        // Check remote was updated
        const remote = await remoteAdapter.get(Post, 1);
        expect(remote).toMatchObject({ title: 'Updated' });

        // Check cache was updated
        const cached = await cacheAdapter.get(Post, 1);
        expect(cached).toMatchObject({ title: 'Updated' });
      });

      it('should queue update when offline', async () => {
        const adapter = createAdapter('cache-then-network', 'network-first');

        await cacheAdapter.create(Post, {
          id: 1,
          title: 'Original',
          content: 'Content',
          updated_at: Date.now(),
        });

        const queuedSpy = vi.fn();
        adapter.signals.operationQueued.connect(queuedSpy);

        isOnline = false;
        await adapter.update(Post, { id: 1 }, { title: 'Updated Offline' });

        expect(remoteAdapter.callCount.update).toBe(0);
        expect(queuedSpy).toHaveBeenCalled();
        const call = queuedSpy.mock.calls[0];
        expect(call[1]).toMatchObject({
          operation: 'update',
          modelName: 'Post',
        });
      });
    });

    describe('network-first (delete)', () => {
      it('should delete from remote first when online', async () => {
        const adapter = createAdapter('cache-then-network', 'network-first');

        // Create post in both places
        await remoteAdapter.create(Post, {
          id: 1,
          title: 'To Delete',
          content: 'Content',
          updated_at: Date.now(),
        });
        await cacheAdapter.create(Post, {
          id: 1,
          title: 'To Delete',
          content: 'Content',
          updated_at: Date.now(),
        });

        remoteAdapter.resetCallCount();
        await adapter.delete(Post, { id: 1 });

        expect(remoteAdapter.callCount.delete).toBe(1);

        // Check both are deleted
        expect(await remoteAdapter.get(Post, 1)).toBeNull();
        expect(await cacheAdapter.get(Post, 1)).toBeNull();
      });

      it('should queue delete when offline', async () => {
        const adapter = createAdapter('cache-then-network', 'network-first');

        await cacheAdapter.create(Post, {
          id: 1,
          title: 'To Delete',
          content: 'Content',
          updated_at: Date.now(),
        });

        const queuedSpy = vi.fn();
        adapter.signals.operationQueued.connect(queuedSpy);

        isOnline = false;
        await adapter.delete(Post, { id: 1 });

        expect(remoteAdapter.callCount.delete).toBe(0);
        expect(queuedSpy).toHaveBeenCalled();
        const call = queuedSpy.mock.calls[0];
        expect(call[1]).toMatchObject({
          operation: 'delete',
          modelName: 'Post',
        });

        // Should be deleted from cache
        expect(await cacheAdapter.get(Post, 1)).toBeNull();
      });
    });
  });

  describe('List Operations', () => {
    it('should merge cache and network results in cache-then-network', async () => {
      const adapter = createAdapter('cache-then-network');

      // Add 2 posts to cache
      await cacheAdapter.create(Post, {
        id: 1,
        title: 'Cached 1',
        content: 'Content',
        updated_at: 1000,
      });
      await cacheAdapter.create(Post, {
        id: 2,
        title: 'Cached 2',
        content: 'Content',
        updated_at: 1000,
      });

      // Add 3 posts to remote (one updated, one new)
      await remoteAdapter.create(Post, {
        id: 1,
        title: 'Updated 1',
        content: 'Content',
        updated_at: 2000,
      });
      await remoteAdapter.create(Post, {
        id: 2,
        title: 'Cached 2',
        content: 'Content',
        updated_at: 1000,
      });
      await remoteAdapter.create(Post, {
        id: 3,
        title: 'New 3',
        content: 'Content',
        updated_at: 2000,
      });

      const result = await adapter.list(Post, { filters: [] });

      // Should return cache immediately (2 items)
      expect(result).toHaveLength(2);

      // Wait for background merge
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check cache was merged
      const cached = await cacheAdapter.list(Post, { filters: [] });
      expect(cached).toHaveLength(3);
      expect(cached.find((p) => p.id === 1)).toMatchObject({ title: 'Updated 1' });
      expect(cached.find((p) => p.id === 3)).toMatchObject({ title: 'New 3' });
    });
  });

  describe('Offline Queue', () => {
    it('should process queue when going online', async () => {
      const adapter = createAdapter('cache-then-network', 'network-first');

      const syncedSpy = vi.fn();
      adapter.signals.operationSynced.connect(syncedSpy);

      // Create operations while offline
      isOnline = false;

      await adapter.create(Post, {
        title: 'Offline Post 1',
        content: 'Content',
        updated_at: Date.now(),
      });

      await adapter.create(Post, {
        title: 'Offline Post 2',
        content: 'Content',
        updated_at: Date.now(),
      });

      expect(remoteAdapter.callCount.create).toBe(0);

      // Go online and process queue
      isOnline = true;
      remoteAdapter.shouldFail = false;

      await adapter.processQueue();

      // Queue processing is async, so we need to wait
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(syncedSpy).toHaveBeenCalled();
    });

    it('should retry failed operations', async () => {
      const adapter = createAdapter('cache-then-network', 'network-first');

      // Queue an operation
      isOnline = false;
      await adapter.create(Post, {
        title: 'Test Post',
        content: 'Content',
        updated_at: Date.now(),
      });

      // Try to process but fail
      isOnline = true;
      remoteAdapter.shouldFail = true;

      await adapter.processQueue();
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Should have attempted but not removed from queue
      expect(remoteAdapter.callCount.create).toBeGreaterThan(0);
    });
  });

  describe('Signals', () => {
    it('should emit all relevant signals during operations', async () => {
      const adapter = createAdapter('cache-then-network', 'network-first');

      const signals = {
        cacheHit: vi.fn(),
        networkFetch: vi.fn(),
        cacheUpdated: vi.fn(),
        operationQueued: vi.fn(),
      };

      adapter.signals.cacheHit.connect(signals.cacheHit);
      adapter.signals.networkFetch.connect(signals.networkFetch);
      adapter.signals.cacheUpdated.connect(signals.cacheUpdated);
      adapter.signals.operationQueued.connect(signals.operationQueued);

      // Create post
      await adapter.create(Post, {
        id: 1,
        title: 'Test',
        content: 'Content',
        updated_at: Date.now(),
      });

      expect(signals.networkFetch).toHaveBeenCalled();

      // Read with cache-then-network
      await adapter.get(Post, 1);
      expect(signals.cacheHit).toHaveBeenCalled();

      // Create offline to test queue
      isOnline = false;
      await adapter.create(Post, {
        id: 2,
        title: 'Offline',
        content: 'Content',
        updated_at: Date.now(),
      });

      expect(signals.operationQueued).toHaveBeenCalled();
    });
  });

  describe('Count Operation', () => {
    it('should count from cache by default', async () => {
      const adapter = createAdapter('cache-then-network');

      await cacheAdapter.create(Post, {
        id: 1,
        title: 'Post 1',
        content: 'Content',
        updated_at: Date.now(),
      });
      await cacheAdapter.create(Post, {
        id: 2,
        title: 'Post 2',
        content: 'Content',
        updated_at: Date.now(),
      });

      const count = await adapter.count(Post, { filters: [] });

      expect(count).toBe(2);
      expect(remoteAdapter.callCount.list).toBe(0);
    });

    it('should count from remote with network-first strategy', async () => {
      const adapter = createAdapter('network-first');

      await remoteAdapter.create(Post, {
        id: 1,
        title: 'Remote 1',
        content: 'Content',
        updated_at: Date.now(),
      });
      await remoteAdapter.create(Post, {
        id: 2,
        title: 'Remote 2',
        content: 'Content',
        updated_at: Date.now(),
      });
      await remoteAdapter.create(Post, {
        id: 3,
        title: 'Remote 3',
        content: 'Content',
        updated_at: Date.now(),
      });

      remoteAdapter.resetCallCount();

      // Count uses list internally in MemoryAdapter
      const count = await adapter.count(Post, { filters: [] });

      expect(count).toBe(3);
    });
  });
});
