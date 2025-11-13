/**
 * Unit tests for SyncEngine
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncEngine } from '../../src/sync/SyncEngine';
import { OperationQueue } from '../../src/sync/OperationQueue';
import { MemoryAdapter } from '../../src/adapters/MemoryAdapter';
import { signals } from '../../src/core/Signal';
import type { ModelClass } from '../../src/types';

// Mock model class
class TestModel {
  id?: string | number;
  name?: string;
  updatedAt?: number;

  constructor(data: Record<string, unknown>) {
    Object.assign(this, data);
  }

  static fromDB(data: Record<string, unknown>): TestModel {
    return new TestModel(data);
  }
}

describe('SyncEngine', () => {
  let localAdapter: MemoryAdapter;
  let remoteAdapter: MemoryAdapter;
  let queue: OperationQueue;
  let engine: SyncEngine;
  let modelRegistry: Map<string, ModelClass>;

  beforeEach(async () => {
    // Clear signal listeners
    signals.preSync.clear();
    signals.postSync.clear();
    signals.syncConflict.clear();

    // Create adapters
    localAdapter = new MemoryAdapter();
    remoteAdapter = new MemoryAdapter();
    await localAdapter.connect();
    await remoteAdapter.connect();

    // Create queue
    queue = new OperationQueue({ persist: false });

    // Create model registry
    modelRegistry = new Map();
    modelRegistry.set('TestModel', TestModel as unknown as ModelClass);

    // Create engine
    engine = new SyncEngine({
      local: localAdapter,
      remote: remoteAdapter,
      queue,
      syncStrategy: 'last-write-wins',
      retryAttempts: 0, // Disable retries for faster tests
      modelRegistry,
    });
  });

  describe('push', () => {
    it('should return empty result when queue is empty', async () => {
      const result = await engine.push();

      expect(result.success).toBe(true);
      expect(result.pushed).toBe(0);
      expect(result.pulled).toBe(0);
      expect(result.conflicts).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should push create operation to remote', async () => {
      // Add create operation to queue
      queue.add({
        type: 'create',
        modelName: 'TestModel',
        data: { name: 'Test Item', updatedAt: Date.now() },
      });

      const result = await engine.push();

      expect(result.success).toBe(true);
      expect(result.pushed).toBe(1);
      expect(result.failed).toBe(0);

      // Verify record in remote
      const remoteRecords = await remoteAdapter.find(TestModel as unknown as ModelClass, {});
      expect(remoteRecords.length).toBe(1);
      expect((remoteRecords[0] as any).name).toBe('Test Item');
    });

    it('should push update operation to remote', async () => {
      // Create record in remote first
      const created = await remoteAdapter.create(TestModel as unknown as ModelClass, {
        name: 'Original',
        updatedAt: Date.now(),
      });
      const id = (created as any).id;

      // Add update operation to queue
      queue.add({
        type: 'update',
        modelName: 'TestModel',
        data: { id, name: 'Updated', updatedAt: Date.now() },
        remoteId: id,
      });

      const result = await engine.push();

      expect(result.success).toBe(true);
      expect(result.pushed).toBe(1);

      // Verify update in remote
      const remoteRecords = await remoteAdapter.find(TestModel as unknown as ModelClass, { id });
      expect((remoteRecords[0] as any).name).toBe('Updated');
    });

    it('should push delete operation to remote', async () => {
      // Create record in remote first
      const created = await remoteAdapter.create(TestModel as unknown as ModelClass, {
        name: 'To Delete',
        updatedAt: Date.now(),
      });
      const id = (created as any).id;

      // Add delete operation to queue
      queue.add({
        type: 'delete',
        modelName: 'TestModel',
        data: { id },
        remoteId: id,
      });

      const result = await engine.push();

      expect(result.success).toBe(true);
      expect(result.pushed).toBe(1);

      // Verify deleted from remote
      const remoteRecords = await remoteAdapter.find(TestModel as unknown as ModelClass, { id });
      expect(remoteRecords.length).toBe(0);
    });

    it('should emit preSync and postSync signals', async () => {
      const preSyncHandler = vi.fn();
      const postSyncHandler = vi.fn();

      signals.preSync.connect(preSyncHandler);
      signals.postSync.connect(postSyncHandler);

      queue.add({
        type: 'create',
        modelName: 'TestModel',
        data: { name: 'Test' },
      });

      await engine.push();

      expect(preSyncHandler).toHaveBeenCalled();
      expect(postSyncHandler).toHaveBeenCalled();

      const preSyncCall = preSyncHandler.mock.calls[0];
      expect(preSyncCall[2]?.direction).toBe('push');

      const postSyncCall = postSyncHandler.mock.calls[0];
      expect(postSyncCall[2]?.direction).toBe('push');
      expect(postSyncCall[2]?.result).toBeDefined();
    });

    it('should handle failed operations', async () => {
      // Add operation with invalid model name
      queue.add({
        type: 'create',
        modelName: 'NonExistentModel',
        data: { name: 'Test' },
      });

      const result = await engine.push();

      expect(result.success).toBe(false);
      expect(result.failed).toBe(1);
      expect(result.errors.length).toBe(1);
    });

    it('should push multiple operations in order', async () => {
      queue.add({
        type: 'create',
        modelName: 'TestModel',
        data: { name: 'First' },
      });

      queue.add({
        type: 'create',
        modelName: 'TestModel',
        data: { name: 'Second' },
      });

      queue.add({
        type: 'create',
        modelName: 'TestModel',
        data: { name: 'Third' },
      });

      const result = await engine.push();

      expect(result.success).toBe(true);
      expect(result.pushed).toBe(3);

      const remoteRecords = await remoteAdapter.find(TestModel as unknown as ModelClass, {});
      expect(remoteRecords.length).toBe(3);
    });
  });

  describe('pull', () => {
    it('should return empty result when no models registered', async () => {
      const emptyEngine = new SyncEngine({
        local: localAdapter,
        remote: remoteAdapter,
        queue,
        syncStrategy: 'last-write-wins',
        modelRegistry: new Map(),
      });

      const result = await emptyEngine.pull();

      expect(result.success).toBe(true);
      expect(result.pulled).toBe(0);
    });

    it('should pull new records from remote to local', async () => {
      // Create records in remote
      await remoteAdapter.create(TestModel as unknown as ModelClass, {
        name: 'Remote Item 1',
        updatedAt: Date.now(),
      });

      await remoteAdapter.create(TestModel as unknown as ModelClass, {
        name: 'Remote Item 2',
        updatedAt: Date.now(),
      });

      const result = await engine.pull();

      expect(result.success).toBe(true);
      expect(result.pulled).toBe(2);

      // Verify records in local
      const localRecords = await localAdapter.find(TestModel as unknown as ModelClass, {});
      expect(localRecords.length).toBe(2);
    });

    it('should update existing local records from remote', async () => {
      // Create record in both adapters
      const id = 'test-id';
      await localAdapter.create(TestModel as unknown as ModelClass, {
        id,
        name: 'Local Version',
        updatedAt: Date.now() - 1000,
      });

      await remoteAdapter.create(TestModel as unknown as ModelClass, {
        id,
        name: 'Remote Version',
        updatedAt: Date.now(),
      });

      const result = await engine.pull();

      expect(result.success).toBe(true);
      expect(result.pulled).toBe(1);

      // Verify local was updated
      const localRecords = await localAdapter.find(TestModel as unknown as ModelClass, { id });
      expect((localRecords[0] as any).name).toBe('Remote Version');
    });

    it('should detect conflicts when local is newer', async () => {
      const id = 'test-id';
      const now = Date.now();

      // Local is newer
      await localAdapter.create(TestModel as unknown as ModelClass, {
        id,
        name: 'Local Newer',
        updatedAt: now + 1000,
      });

      // Remote is older
      await remoteAdapter.create(TestModel as unknown as ModelClass, {
        id,
        name: 'Remote Older',
        updatedAt: now,
      });

      const result = await engine.pull();

      expect(result.conflicts).toBeGreaterThan(0);
    });

    it('should emit preSync and postSync signals on pull', async () => {
      const preSyncHandler = vi.fn();
      const postSyncHandler = vi.fn();

      signals.preSync.connect(preSyncHandler);
      signals.postSync.connect(postSyncHandler);

      await remoteAdapter.create(TestModel as unknown as ModelClass, {
        name: 'Test',
        updatedAt: Date.now(),
      });

      await engine.pull();

      expect(preSyncHandler).toHaveBeenCalled();
      expect(postSyncHandler).toHaveBeenCalled();

      const preSyncCall = preSyncHandler.mock.calls[0];
      expect(preSyncCall[2]?.direction).toBe('pull');
    });
  });

  describe('sync (bidirectional)', () => {
    it('should pull then push', async () => {
      // Create record in remote (to be pulled)
      const remote = await remoteAdapter.create(TestModel as unknown as ModelClass, {
        name: 'From Remote',
        updatedAt: Date.now(),
      });

      // Add create operation to queue (to be pushed)
      queue.add({
        type: 'create',
        modelName: 'TestModel',
        data: { name: 'From Local', updatedAt: Date.now() },
      });

      const result = await engine.sync();

      expect(result.success).toBe(true);
      expect(result.pulled).toBe(1);
      expect(result.pushed).toBe(1);

      // Verify pulled record in local
      const localRecords = await localAdapter.find(TestModel as unknown as ModelClass, {});
      expect(localRecords.length).toBeGreaterThanOrEqual(1);
      const hasRemoteRecord = localRecords.some(r => (r as any).name === 'From Remote');
      expect(hasRemoteRecord).toBe(true);

      // Verify pushed record in remote
      const remoteRecords = await remoteAdapter.find(TestModel as unknown as ModelClass, {});
      expect(remoteRecords.length).toBeGreaterThanOrEqual(2);
      const hasLocalRecord = remoteRecords.some(r => (r as any).name === 'From Local');
      expect(hasLocalRecord).toBe(true);
    });

    it('should emit sync signals', async () => {
      const preSyncHandler = vi.fn();
      const postSyncHandler = vi.fn();

      signals.preSync.connect(preSyncHandler);
      signals.postSync.connect(postSyncHandler);

      await engine.sync();

      // Should emit signals for both pull and push
      expect(preSyncHandler).toHaveBeenCalled();
      expect(postSyncHandler).toHaveBeenCalled();
    });
  });

  describe('conflict resolution', () => {
    it('should use last-write-wins strategy by default', async () => {
      const id = 'conflict-id';
      const now = Date.now();

      // Local has older timestamp
      await localAdapter.create(TestModel as unknown as ModelClass, {
        id,
        name: 'Local (older)',
        updatedAt: now - 1000,
      });

      // Remote has newer timestamp
      await remoteAdapter.create(TestModel as unknown as ModelClass, {
        id,
        name: 'Remote (newer)',
        updatedAt: now,
      });

      await engine.pull();

      // Should use remote (newer)
      const localRecords = await localAdapter.find(TestModel as unknown as ModelClass, { id });
      expect((localRecords[0] as any).name).toBe('Remote (newer)');
    });

    it('should use local-wins strategy when configured', async () => {
      const localWinsEngine = new SyncEngine({
        local: localAdapter,
        remote: remoteAdapter,
        queue,
        syncStrategy: 'local-wins',
        modelRegistry,
      });

      const id = 'conflict-id';
      const now = Date.now();

      // Local version
      await localAdapter.create(TestModel as unknown as ModelClass, {
        id,
        name: 'Local Version',
        updatedAt: now + 1000,
      });

      // Remote version
      await remoteAdapter.create(TestModel as unknown as ModelClass, {
        id,
        name: 'Remote Version',
        updatedAt: now,
      });

      await localWinsEngine.pull();

      // Should keep local
      const localRecords = await localAdapter.find(TestModel as unknown as ModelClass, { id });
      expect((localRecords[0] as any).name).toBe('Local Version');
    });

    it('should use remote-wins strategy when configured', async () => {
      const remoteWinsEngine = new SyncEngine({
        local: localAdapter,
        remote: remoteAdapter,
        queue,
        syncStrategy: 'remote-wins',
        modelRegistry,
      });

      const id = 'conflict-id';

      // Local version
      await localAdapter.create(TestModel as unknown as ModelClass, {
        id,
        name: 'Local Version',
        updatedAt: Date.now() + 1000, // Even if local is newer
      });

      // Remote version
      await remoteAdapter.create(TestModel as unknown as ModelClass, {
        id,
        name: 'Remote Version',
        updatedAt: Date.now(),
      });

      await remoteWinsEngine.pull();

      // Should use remote
      const localRecords = await localAdapter.find(TestModel as unknown as ModelClass, { id });
      expect((localRecords[0] as any).name).toBe('Remote Version');
    });

    it('should emit syncConflict signal on conflict', async () => {
      const conflictHandler = vi.fn();
      signals.syncConflict.connect(conflictHandler);

      const id = 'conflict-id';
      const now = Date.now();

      // Create conflicting records (local is newer)
      await localAdapter.create(TestModel as unknown as ModelClass, {
        id,
        name: 'Local Newer',
        updatedAt: now + 1000,
      });

      await remoteAdapter.create(TestModel as unknown as ModelClass, {
        id,
        name: 'Remote Older',
        updatedAt: now,
      });

      await engine.pull();

      expect(conflictHandler).toHaveBeenCalled();

      const call = conflictHandler.mock.calls[0];
      expect(call[2]?.modelName).toBe('TestModel');
      expect(call[2]?.strategy).toBe('last-write-wins');
    });
  });
});
