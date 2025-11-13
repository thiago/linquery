/**
 * Tests for OperationQueue
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OperationQueue } from '../../src/sync/OperationQueue';

describe('OperationQueue', () => {
  let queue: OperationQueue;

  beforeEach(() => {
    queue = new OperationQueue({ persist: false }); // Disable persistence for tests
  });

  describe('add', () => {
    it('should add operation to queue', () => {
      const id = queue.add({
        type: 'create',
        modelName: 'User',
        data: { name: 'John' },
      });

      expect(id).toBeDefined();
      expect(queue.size()).toBe(1);
    });

    it('should generate unique IDs for operations', () => {
      const id1 = queue.add({
        type: 'create',
        modelName: 'User',
        data: { name: 'John' },
      });

      const id2 = queue.add({
        type: 'create',
        modelName: 'User',
        data: { name: 'Jane' },
      });

      expect(id1).not.toBe(id2);
    });

    it('should set initial status to pending', () => {
      const id = queue.add({
        type: 'create',
        modelName: 'User',
        data: { name: 'John' },
      });

      const op = queue.get(id);
      expect(op?.status).toBe('pending');
      expect(op?.attempts).toBe(0);
    });

    it('should respect maxSize limit', () => {
      const smallQueue = new OperationQueue({ maxSize: 2, persist: false });

      smallQueue.add({ type: 'create', modelName: 'User', data: { name: 'User1' } });
      smallQueue.add({ type: 'create', modelName: 'User', data: { name: 'User2' } });

      // Third add should remove oldest and add new
      smallQueue.add({ type: 'create', modelName: 'User', data: { name: 'User3' } });

      expect(smallQueue.size()).toBe(2);
    });
  });

  describe('get', () => {
    it('should retrieve operation by ID', () => {
      const id = queue.add({
        type: 'create',
        modelName: 'User',
        data: { name: 'John' },
      });

      const op = queue.get(id);
      expect(op).toBeDefined();
      expect(op?.id).toBe(id);
      expect(op?.modelName).toBe('User');
      expect(op?.data.name).toBe('John');
    });

    it('should return undefined for non-existent ID', () => {
      const op = queue.get('non-existent');
      expect(op).toBeUndefined();
    });
  });

  describe('getPending', () => {
    it('should return only pending operations', () => {
      const id1 = queue.add({ type: 'create', modelName: 'User', data: {} });
      const id2 = queue.add({ type: 'update', modelName: 'User', data: {} });
      const id3 = queue.add({ type: 'delete', modelName: 'User', data: {} });

      queue.update(id2, { status: 'syncing' });
      queue.update(id3, { status: 'synced' });

      const pending = queue.getPending();
      expect(pending.length).toBe(1);
      expect(pending[0]?.id).toBe(id1);
    });

    it('should return operations ordered by timestamp', () => {
      const id1 = queue.add({ type: 'create', modelName: 'User', data: { order: 1 } });
      const id2 = queue.add({ type: 'create', modelName: 'User', data: { order: 2 } });
      const id3 = queue.add({ type: 'create', modelName: 'User', data: { order: 3 } });

      const pending = queue.getPending();
      expect(pending[0]?.id).toBe(id1);
      expect(pending[1]?.id).toBe(id2);
      expect(pending[2]?.id).toBe(id3);
    });
  });

  describe('getFailed', () => {
    it('should return only failed operations', () => {
      const id1 = queue.add({ type: 'create', modelName: 'User', data: {} });
      const id2 = queue.add({ type: 'update', modelName: 'User', data: {} });

      queue.update(id1, { status: 'failed', error: 'Network error' });

      const failed = queue.getFailed();
      expect(failed.length).toBe(1);
      expect(failed[0]?.id).toBe(id1);
      expect(failed[0]?.error).toBe('Network error');
    });
  });

  describe('update', () => {
    it('should update operation fields', () => {
      const id = queue.add({
        type: 'create',
        modelName: 'User',
        data: {},
      });

      queue.update(id, {
        status: 'syncing',
        attempts: 1,
      });

      const op = queue.get(id);
      expect(op?.status).toBe('syncing');
      expect(op?.attempts).toBe(1);
    });

    it('should throw error for non-existent operation', () => {
      expect(() => {
        queue.update('non-existent', { status: 'syncing' });
      }).toThrow('Operation non-existent not found');
    });
  });

  describe('remove', () => {
    it('should remove operation from queue', () => {
      const id = queue.add({
        type: 'create',
        modelName: 'User',
        data: {},
      });

      expect(queue.size()).toBe(1);

      queue.remove(id);

      expect(queue.size()).toBe(0);
      expect(queue.get(id)).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('should remove all operations', () => {
      queue.add({ type: 'create', modelName: 'User', data: {} });
      queue.add({ type: 'update', modelName: 'User', data: {} });
      queue.add({ type: 'delete', modelName: 'User', data: {} });

      expect(queue.size()).toBe(3);

      queue.clear();

      expect(queue.size()).toBe(0);
      expect(queue.isEmpty()).toBe(true);
    });
  });

  describe('clearSynced', () => {
    it('should remove only synced operations', () => {
      const id1 = queue.add({ type: 'create', modelName: 'User', data: {} });
      const id2 = queue.add({ type: 'update', modelName: 'User', data: {} });
      const id3 = queue.add({ type: 'delete', modelName: 'User', data: {} });

      queue.update(id1, { status: 'synced' });
      queue.update(id2, { status: 'synced' });

      queue.clearSynced();

      expect(queue.size()).toBe(1);
      expect(queue.get(id1)).toBeUndefined();
      expect(queue.get(id2)).toBeUndefined();
      expect(queue.get(id3)).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const id1 = queue.add({ type: 'create', modelName: 'User', data: {} });
      const id2 = queue.add({ type: 'update', modelName: 'User', data: {} });
      const id3 = queue.add({ type: 'delete', modelName: 'User', data: {} });
      const id4 = queue.add({ type: 'create', modelName: 'User', data: {} });

      queue.update(id1, { status: 'pending' });
      queue.update(id2, { status: 'syncing' });
      queue.update(id3, { status: 'synced' });
      queue.update(id4, { status: 'failed' });

      const stats = queue.getStats();

      expect(stats.total).toBe(4);
      expect(stats.pending).toBe(1);
      expect(stats.syncing).toBe(1);
      expect(stats.synced).toBe(1);
      expect(stats.failed).toBe(1);
    });
  });
});
