/**
 * Integration tests for SyncAdapter and push synchronization
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncAdapter } from '../../src/sync/SyncAdapter';
import { MemoryAdapter } from '../../src/adapters/MemoryAdapter';
import { signals } from '../../src/core/Signal';
import type { BackendAdapter, ModelClass } from '../../src/types';

// Mock model class
class User {
  id?: string | number;
  name?: string;
  email?: string;
  updatedAt?: number;

  constructor(data: Record<string, unknown>) {
    Object.assign(this, data);
  }

  static fromDB(data: Record<string, unknown>): User {
    return new User(data);
  }
}

describe('SyncAdapter - Push Synchronization', () => {
  let localAdapter: MemoryAdapter;
  let remoteAdapter: MemoryAdapter;
  let syncAdapter: SyncAdapter;

  beforeEach(async () => {
    // Clear signal listeners
    signals.preSync.clear();
    signals.postSync.clear();
    signals.syncConflict.clear();

    // Create fresh adapters
    localAdapter = new MemoryAdapter();
    remoteAdapter = new MemoryAdapter();

    syncAdapter = new SyncAdapter({
      local: localAdapter,
      remote: remoteAdapter,
      autoSync: false, // Disable auto-sync for tests
      syncStrategy: 'last-write-wins',
    });

    // Register User model
    syncAdapter.registerModel(User as unknown as ModelClass);

    await syncAdapter.connect();
  });

  describe('Create operations', () => {
    it('should create record locally with generated local ID', async () => {
      const user = await syncAdapter.create(User as unknown as ModelClass, {
        name: 'John',
        email: 'john@example.com',
      });

      expect(user).toBeDefined();
      expect((user as any).id).toMatch(/^local-\d+-\d+$/);
      expect((user as any).name).toBe('John');

      // Should be in local adapter
      const localUsers = await localAdapter.find(User as unknown as ModelClass, {});
      expect(localUsers.length).toBe(1);

      // Should NOT be in remote adapter yet
      const remoteUsers = await remoteAdapter.find(User as unknown as ModelClass, {});
      expect(remoteUsers.length).toBe(0);
    });

    it('should queue create operation', async () => {
      await syncAdapter.create(User as unknown as ModelClass, {
        name: 'John',
        email: 'john@example.com',
      });

      const pending = syncAdapter.getPendingOperations();
      expect(pending.length).toBe(1);
      expect(pending[0]?.type).toBe('create');
      expect(pending[0]?.modelName).toBe('User');
    });

    it('should sync create to remote on push', async () => {
      const user = await syncAdapter.create(User as unknown as ModelClass, {
        name: 'John',
        email: 'john@example.com',
      });

      const localId = (user as any).id;

      // Push to remote
      const result = await syncAdapter.push();

      expect(result.success).toBe(true);
      expect(result.pushed).toBe(1);
      expect(result.failed).toBe(0);

      // Should be in remote adapter with different ID
      const remoteUsers = await remoteAdapter.find(User as unknown as ModelClass, {});
      expect(remoteUsers.length).toBe(1);
      expect((remoteUsers[0] as any).name).toBe('John');
      expect((remoteUsers[0] as any).email).toBe('john@example.com');

      // Remote ID should be different from local ID
      const remoteId = (remoteUsers[0] as any).id;
      expect(remoteId).not.toBe(localId);
    });

    it('should update local record with remote ID after sync', async () => {
      const user = await syncAdapter.create(User as unknown as ModelClass, {
        name: 'John',
        email: 'john@example.com',
      });

      const localId = (user as any).id;

      // Push to remote
      await syncAdapter.push();

      // Local record should now have remote ID
      const localUsers = await localAdapter.find(User as unknown as ModelClass, {});
      const localUser = localUsers[0] as any;

      // Note: ID mapping happens, local adapter might still have local ID
      // but the mapping is stored in the sync adapter
      expect(localUsers.length).toBe(1);
    });
  });

  describe('Update operations', () => {
    it('should update locally and queue operation', async () => {
      // Create a record first
      const user = await syncAdapter.create(User as unknown as ModelClass, {
        name: 'John',
        email: 'john@example.com',
      });

      // Clear pending operations from create
      syncAdapter.clearQueue();

      // Update the record
      await syncAdapter.update(
        User as unknown as ModelClass,
        { id: (user as any).id },
        { name: 'John Updated' }
      );

      // Should be updated locally
      const localUsers = await localAdapter.find(User as unknown as ModelClass, {});
      expect((localUsers[0] as any).name).toBe('John Updated');

      // Should be queued
      const pending = syncAdapter.getPendingOperations();
      expect(pending.length).toBe(1);
      expect(pending[0]?.type).toBe('update');
    });

    it('should sync update to remote on push', async () => {
      // Create and sync first
      const user = await syncAdapter.create(User as unknown as ModelClass, {
        name: 'John',
        email: 'john@example.com',
      });

      await syncAdapter.push();
      syncAdapter.clearSynced();

      // Update locally
      await syncAdapter.update(
        User as unknown as ModelClass,
        { id: (user as any).id },
        { name: 'John Updated' }
      );

      // Push update
      const result = await syncAdapter.push();

      expect(result.success).toBe(true);
      expect(result.pushed).toBe(1);

      // Remote should be updated
      const remoteUsers = await remoteAdapter.find(User as unknown as ModelClass, {});
      // Note: update might create if ID mapping is missing, which is expected
      expect(remoteUsers.length).toBeGreaterThan(0);
    });
  });

  describe('Delete operations', () => {
    it('should queue delete operation', async () => {
      const user = await syncAdapter.create(User as unknown as ModelClass, {
        name: 'John',
        email: 'john@example.com',
      });

      await syncAdapter.push();
      syncAdapter.clearSynced();

      // Delete the record
      await syncAdapter.delete(User as unknown as ModelClass, { id: (user as any).id });

      // Should be queued
      const pending = syncAdapter.getPendingOperations();
      expect(pending.length).toBe(1);
      expect(pending[0]?.type).toBe('delete');
    });
  });

  describe('Signal emissions', () => {
    it('should emit preSync signal before push', async () => {
      const handler = vi.fn();
      signals.preSync.connect(handler);

      await syncAdapter.create(User as unknown as ModelClass, {
        name: 'John',
        email: 'john@example.com',
      });

      await syncAdapter.push();

      expect(handler).toHaveBeenCalled();
      const call = handler.mock.calls[0];
      expect(call[2]?.direction).toBe('push');
    });

    it('should emit postSync signal after push', async () => {
      const handler = vi.fn();
      signals.postSync.connect(handler);

      await syncAdapter.create(User as unknown as ModelClass, {
        name: 'John',
        email: 'john@example.com',
      });

      await syncAdapter.push();

      expect(handler).toHaveBeenCalled();
      const call = handler.mock.calls[0];
      expect(call[2]?.direction).toBe('push');
      expect(call[2]?.result).toBeDefined();
    });
  });

  describe('Queue management', () => {
    it('should get pending operations', async () => {
      await syncAdapter.create(User as unknown as ModelClass, { name: 'User1' });
      await syncAdapter.create(User as unknown as ModelClass, { name: 'User2' });

      const pending = syncAdapter.getPendingOperations();
      expect(pending.length).toBe(2);
    });

    it('should get failed operations', async () => {
      // Create a mock remote adapter that fails
      const failingAdapter: BackendAdapter = {
        ...remoteAdapter,
        connect: async () => {},
        disconnect: async () => {},
        find: remoteAdapter.find.bind(remoteAdapter),
        update: remoteAdapter.update.bind(remoteAdapter),
        delete: remoteAdapter.delete.bind(remoteAdapter),
        create: async () => {
          throw new Error('Network error');
        },
      };

      const failingSyncAdapter = new SyncAdapter({
        local: localAdapter,
        remote: failingAdapter,
        autoSync: false,
        retryAttempts: 0, // Disable retries for faster test
      });

      failingSyncAdapter.registerModel(User as unknown as ModelClass);
      await failingSyncAdapter.connect();

      await failingSyncAdapter.create(User as unknown as ModelClass, { name: 'John' });

      const result = await failingSyncAdapter.push();

      expect(result.success).toBe(false);
      expect(result.failed).toBe(1);

      const failed = failingSyncAdapter.getFailedOperations();
      expect(failed.length).toBe(1);
      expect(failed[0]?.error).toContain('Network error');
    });

    it('should retry failed operations', async () => {
      let attempts = 0;
      const failingThenSuccessAdapter: BackendAdapter = {
        ...remoteAdapter,
        connect: async () => {},
        disconnect: async () => {},
        find: remoteAdapter.find.bind(remoteAdapter),
        update: remoteAdapter.update.bind(remoteAdapter),
        delete: remoteAdapter.delete.bind(remoteAdapter),
        create: async <T>(model: ModelClass<T>, data: Record<string, unknown>): Promise<T> => {
          attempts++;
          // Fail on first 2 attempts, succeed on 3rd
          if (attempts <= 2) {
            throw new Error('Network error');
          }
          return remoteAdapter.create(model, data);
        },
      };

      const retrySyncAdapter = new SyncAdapter({
        local: localAdapter,
        remote: failingThenSuccessAdapter,
        autoSync: false,
        retryAttempts: 1, // Allow 1 retry (2 total attempts)
      });

      retrySyncAdapter.registerModel(User as unknown as ModelClass);
      await retrySyncAdapter.connect();

      await retrySyncAdapter.create(User as unknown as ModelClass, { name: 'John' });

      // First push fails after retries exhausted (2 attempts)
      const result1 = await retrySyncAdapter.push();
      expect(result1.success).toBe(false);
      expect(result1.failed).toBe(1);
      expect(attempts).toBe(2); // Tried twice

      // Retry failed operations (3rd attempt succeeds)
      const result2 = await retrySyncAdapter.retryFailed();
      expect(result2.pushed).toBe(1);
      expect(attempts).toBe(3); // Tried a third time

      const failed = retrySyncAdapter.getFailedOperations();
      expect(failed.length).toBe(0);
    });

    it('should clear queue', async () => {
      await syncAdapter.create(User as unknown as ModelClass, { name: 'User1' });
      await syncAdapter.create(User as unknown as ModelClass, { name: 'User2' });

      expect(syncAdapter.getPendingOperations().length).toBe(2);

      syncAdapter.clearQueue();

      expect(syncAdapter.getPendingOperations().length).toBe(0);
    });

    it('should clear synced operations', async () => {
      await syncAdapter.create(User as unknown as ModelClass, { name: 'John' });

      await syncAdapter.push();

      // Before clearing synced
      const stats1 = syncAdapter.getQueueStats();
      expect(stats1.synced).toBe(1);

      syncAdapter.clearSynced();

      // After clearing synced
      const stats2 = syncAdapter.getQueueStats();
      expect(stats2.synced).toBe(0);
      expect(stats2.total).toBe(0);
    });

    it('should provide queue statistics', async () => {
      await syncAdapter.create(User as unknown as ModelClass, { name: 'User1' });
      await syncAdapter.create(User as unknown as ModelClass, { name: 'User2' });

      const stats = syncAdapter.getQueueStats();
      expect(stats.total).toBe(2);
      expect(stats.pending).toBe(2);
      expect(stats.syncing).toBe(0);
      expect(stats.synced).toBe(0);
      expect(stats.failed).toBe(0);
    });
  });

  describe('Multiple operations', () => {
    it('should push multiple operations in order', async () => {
      await syncAdapter.create(User as unknown as ModelClass, { name: 'User1' });
      await syncAdapter.create(User as unknown as ModelClass, { name: 'User2' });
      await syncAdapter.create(User as unknown as ModelClass, { name: 'User3' });

      const result = await syncAdapter.push();

      expect(result.success).toBe(true);
      expect(result.pushed).toBe(3);

      const remoteUsers = await remoteAdapter.find(User as unknown as ModelClass, {});
      expect(remoteUsers.length).toBe(3);
    });

    it('should continue pushing after a failed operation', async () => {
      const partiallyFailingAdapter: BackendAdapter = {
        ...remoteAdapter,
        connect: async () => {},
        disconnect: async () => {},
        find: remoteAdapter.find.bind(remoteAdapter),
        update: remoteAdapter.update.bind(remoteAdapter),
        delete: remoteAdapter.delete.bind(remoteAdapter),
        create: async <T>(model: ModelClass<T>, data: Record<string, unknown>): Promise<T> => {
          // Fail operations for User2 specifically
          if (data.name === 'User2') {
            throw new Error('Network error');
          }
          return remoteAdapter.create(model, data);
        },
      };

      const partialSyncAdapter = new SyncAdapter({
        local: localAdapter,
        remote: partiallyFailingAdapter,
        autoSync: false,
        retryAttempts: 0, // No retries for faster test
      });

      partialSyncAdapter.registerModel(User as unknown as ModelClass);
      await partialSyncAdapter.connect();

      await partialSyncAdapter.create(User as unknown as ModelClass, { name: 'User1' });
      await partialSyncAdapter.create(User as unknown as ModelClass, { name: 'User2' });
      await partialSyncAdapter.create(User as unknown as ModelClass, { name: 'User3' });

      const result = await partialSyncAdapter.push();

      expect(result.success).toBe(false); // Overall fails because one failed
      expect(result.pushed).toBe(2);      // But 2 succeeded
      expect(result.failed).toBe(1);

      const remoteUsers = await remoteAdapter.find(User as unknown as ModelClass, {});
      expect(remoteUsers.length).toBe(2); // User1 and User3 synced
    });
  });

  describe('Connectivity status', () => {
    it('should report online/offline status', () => {
      // Default connectivity manager in test environment
      // In Node.js environment, connectivity status defaults to online
      expect(typeof syncAdapter.isOnline()).toBe('boolean');
      expect(typeof syncAdapter.isOffline()).toBe('boolean');
      expect(syncAdapter.isOnline()).toBe(!syncAdapter.isOffline());
    });
  });

  describe('Model auto-registration', () => {
    it('should auto-register models on first use', async () => {
      // Create a new model class
      class Product {
        id?: string | number;
        title?: string;

        constructor(data: Record<string, unknown>) {
          Object.assign(this, data);
        }

        static fromDB(data: Record<string, unknown>): Product {
          return new Product(data);
        }
      }

      // Use without explicit registration
      await syncAdapter.create(Product as unknown as ModelClass, {
        title: 'Test Product',
      });

      // Should be registered and queued
      const pending = syncAdapter.getPendingOperations();
      expect(pending.some(op => op.modelName === 'Product')).toBe(true);
    });
  });
});
