/**
 * DexieAdapter tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';
import { DexieAdapter } from '../../src/adapters/DexieAdapter';
import { Model } from '../../src/core/Model';
import { CharField, IntegerField, BooleanField } from '../../src/core/Field';
import type { QueryPlan } from '../../src/types';

describe('DexieAdapter', () => {
  let db: Dexie;
  let adapter: DexieAdapter;
  let dbCounter = 0;

  class Post extends Model {
    static tableName = 'post';

    declare id?: number;
    declare title: string;
    declare content: string;
    declare published: boolean;
    declare views: number;
  }

  // Initialize Post model
  Post.init({
    title: new CharField({ maxLength: 100 }),
    content: new CharField({ maxLength: 500 }),
    published: new BooleanField({ default: false }),
    views: new IntegerField({ default: 0 }),
  });

  beforeEach(async () => {
    // Create new Dexie instance for each test with unique name
    dbCounter++;
    db = new Dexie(`testdb${dbCounter}`);
    db.version(1).stores({
      post: '++id, title, content, published, views',
      user: '++id, name, email',
    });

    adapter = new DexieAdapter(db);
    await adapter.connect();
    Post.setAdapter(adapter);
  });

  afterEach(async () => {
    // Clear tables instead of deleting DB
    try {
      await adapter.clearAll();
    } catch (e) {
      // Ignore errors during cleanup
    }
    await adapter.disconnect();
  });

  describe('Connection', () => {
    it('should connect successfully', async () => {
      const newDb = new Dexie('testdb2');
      newDb.version(1).stores({ post: '++id' });
      const newAdapter = new DexieAdapter(newDb);

      await expect(newAdapter.connect()).resolves.toBeUndefined();
      await newAdapter.disconnect();
      await newDb.delete();
    });

    it('should clear data on connect if clearOnConnect is true', async () => {
      // Add some data first
      await adapter.create(Post, { title: 'Test', content: 'Content', published: false, views: 0 });

      // Disconnect and reconnect with clearOnConnect
      await adapter.disconnect();

      const newAdapter = new DexieAdapter(db, { clearOnConnect: true });
      await newAdapter.connect();

      const stats = await newAdapter.getStats();
      expect(stats.counts.posts).toBe(0);

      await newAdapter.disconnect();
    });
  });

  describe('CRUD Operations', () => {
    it('should create a record with auto-generated ID', async () => {
      const data = { title: 'Test Post', content: 'Test Content', published: false, views: 0 };
      const post = await adapter.create(Post, data);

      expect(post).toBeDefined();
      expect((post as any).id).toBeDefined();
      expect((post as any).id).toBeGreaterThan(0);
    });

    it('should create multiple records with incrementing IDs', async () => {
      const post1 = await adapter.create(Post, { title: 'Post 1', content: 'Content 1', published: false, views: 0 });
      const post2 = await adapter.create(Post, { title: 'Post 2', content: 'Content 2', published: false, views: 0 });
      const post3 = await adapter.create(Post, { title: 'Post 3', content: 'Content 3', published: false, views: 0 });

      expect((post1 as any).id).toBe(1);
      expect((post2 as any).id).toBe(2);
      expect((post3 as any).id).toBe(3);
    });

    it('should get a record by ID', async () => {
      await adapter.create(Post, { title: 'Test Post', content: 'Test Content', published: false, views: 0 });
      const post = await adapter.get(Post, 1);

      expect(post).toBeDefined();
      expect((post as any).title).toBe('Test Post');
    });

    it('should return null when record not found', async () => {
      const post = await adapter.get(Post, 999);
      expect(post).toBeNull();
    });

    it('should find records by filter', async () => {
      await adapter.create(Post, { title: 'Post 1', content: 'Content 1', published: true, views: 0 });
      await adapter.create(Post, { title: 'Post 2', content: 'Content 2', published: false, views: 0 });
      await adapter.create(Post, { title: 'Post 3', content: 'Content 3', published: true, views: 0 });

      const published = await adapter.find(Post, { published: true });
      expect(published.length).toBe(2);
    });

    it('should update records matching filter', async () => {
      await adapter.create(Post, { title: 'Old Title', content: 'Content', published: false, views: 0 });

      await adapter.update(Post, { published: false }, { published: true, title: 'New Title' });

      const updated = await adapter.get(Post, 1);
      expect((updated as any).title).toBe('New Title');
      expect((updated as any).published).toBe(true);
    });

    it('should delete records matching filter', async () => {
      await adapter.create(Post, { title: 'Post 1', content: 'Content 1', published: true, views: 0 });
      await adapter.create(Post, { title: 'Post 2', content: 'Content 2', published: false, views: 0 });

      await adapter.delete(Post, { published: true });

      const remaining = await adapter.find(Post, {});
      expect(remaining.length).toBe(1);
      expect((remaining[0] as any).published).toBe(false);
    });
  });

  describe('Query Operations', () => {
    beforeEach(async () => {
      await adapter.create(Post, { title: 'Alpha', content: 'Content', published: true, views: 100 });
      await adapter.create(Post, { title: 'Beta', content: 'Content', published: false, views: 200 });
      await adapter.create(Post, { title: 'Gamma', content: 'Content', published: true, views: 150 });
      await adapter.create(Post, { title: 'Delta', content: 'Content', published: false, views: 50 });
    });

    it('should apply filters with exact lookup', async () => {
      const plan: QueryPlan = {
        model: Post,
        filters: [{ field: 'published', lookup: 'exact', value: true }],
        excludes: [],
        ordering: [],
        selectRelated: [],
        prefetchRelated: [],
      };

      const results = await adapter.list(Post, plan);
      expect(results.length).toBe(2);
    });

    it('should apply ordering (ascending)', async () => {
      const plan: QueryPlan = {
        model: Post,
        filters: [],
        excludes: [],
        ordering: [{ field: 'views', direction: 'asc' }],
        selectRelated: [],
        prefetchRelated: [],
      };

      const results = await adapter.list(Post, plan);
      expect((results[0] as any).views).toBe(50);
      expect((results[3] as any).views).toBe(200);
    });

    it('should apply ordering (descending)', async () => {
      const plan: QueryPlan = {
        model: Post,
        filters: [],
        excludes: [],
        ordering: [{ field: 'views', direction: 'desc' }],
        selectRelated: [],
        prefetchRelated: [],
      };

      const results = await adapter.list(Post, plan);
      expect((results[0] as any).views).toBe(200);
      expect((results[3] as any).views).toBe(50);
    });

    it('should apply limit', async () => {
      const plan: QueryPlan = {
        model: Post,
        filters: [],
        excludes: [],
        ordering: [],
        limit: 2,
        selectRelated: [],
        prefetchRelated: [],
      };

      const results = await adapter.list(Post, plan);
      expect(results.length).toBe(2);
    });

    it('should apply offset', async () => {
      const plan: QueryPlan = {
        model: Post,
        filters: [],
        excludes: [],
        ordering: [{ field: 'title', direction: 'asc' }],
        offset: 2,
        selectRelated: [],
        prefetchRelated: [],
      };

      const results = await adapter.list(Post, plan);
      expect(results.length).toBe(2);
      expect((results[0] as any).title).toBe('Delta');
    });

    it('should apply limit and offset together', async () => {
      const plan: QueryPlan = {
        model: Post,
        filters: [],
        excludes: [],
        ordering: [{ field: 'title', direction: 'asc' }],
        limit: 2,
        offset: 1,
        selectRelated: [],
        prefetchRelated: [],
      };

      const results = await adapter.list(Post, plan);
      expect(results.length).toBe(2);
      expect((results[0] as any).title).toBe('Beta');
      expect((results[1] as any).title).toBe('Delta');
    });

    it('should count records', async () => {
      const plan: QueryPlan = {
        model: Post,
        filters: [{ field: 'published', lookup: 'exact', value: true }],
        excludes: [],
        ordering: [],
        selectRelated: [],
        prefetchRelated: [],
      };

      const count = await adapter.count(Post, plan);
      expect(count).toBe(2);
    });

    it('should check if records exist', async () => {
      const plan: QueryPlan = {
        model: Post,
        filters: [{ field: 'published', lookup: 'exact', value: true }],
        excludes: [],
        ordering: [],
        selectRelated: [],
        prefetchRelated: [],
      };

      const exists = await adapter.exists(Post, plan);
      expect(exists).toBe(true);
    });

    it('should return false when no records exist', async () => {
      const plan: QueryPlan = {
        model: Post,
        filters: [{ field: 'views', lookup: 'gt', value: 1000 }],
        excludes: [],
        ordering: [],
        selectRelated: [],
        prefetchRelated: [],
      };

      const exists = await adapter.exists(Post, plan);
      expect(exists).toBe(false);
    });
  });

  describe('Field Lookups', () => {
    beforeEach(async () => {
      await adapter.create(Post, { title: 'Hello World', content: 'Content', views: 100, published: false });
      await adapter.create(Post, { title: 'HELLO AGAIN', content: 'Content', views: 200, published: false });
      await adapter.create(Post, { title: 'Goodbye', content: 'Content', views: 150, published: false });
    });

    it('should filter with contains lookup', async () => {
      const plan: QueryPlan = {
        model: Post,
        filters: [{ field: 'title', lookup: 'contains', value: 'Hello' }],
        excludes: [],
        ordering: [],
        selectRelated: [],
        prefetchRelated: [],
      };

      const results = await adapter.list(Post, plan);
      expect(results.length).toBe(1);
      expect((results[0] as any).title).toBe('Hello World');
    });

    it('should filter with icontains lookup', async () => {
      const plan: QueryPlan = {
        model: Post,
        filters: [{ field: 'title', lookup: 'icontains', value: 'hello' }],
        excludes: [],
        ordering: [],
        selectRelated: [],
        prefetchRelated: [],
      };

      const results = await adapter.list(Post, plan);
      expect(results.length).toBe(2);
    });

    it('should filter with gt lookup', async () => {
      const plan: QueryPlan = {
        model: Post,
        filters: [{ field: 'views', lookup: 'gt', value: 100 }],
        excludes: [],
        ordering: [],
        selectRelated: [],
        prefetchRelated: [],
      };

      const results = await adapter.list(Post, plan);
      expect(results.length).toBe(2);
    });

    it('should filter with in lookup', async () => {
      const plan: QueryPlan = {
        model: Post,
        filters: [{ field: 'views', lookup: 'in', value: [100, 200] }],
        excludes: [],
        ordering: [],
        selectRelated: [],
        prefetchRelated: [],
      };

      const results = await adapter.list(Post, plan);
      expect(results.length).toBe(2);
    });

    it('should filter with range lookup', async () => {
      const plan: QueryPlan = {
        model: Post,
        filters: [{ field: 'views', lookup: 'range', value: [100, 150] }],
        excludes: [],
        ordering: [],
        selectRelated: [],
        prefetchRelated: [],
      };

      const results = await adapter.list(Post, plan);
      expect(results.length).toBe(2);
    });
  });

  describe('Utility Methods', () => {
    it('should get storage stats', async () => {
      await adapter.create(Post, { title: 'Post 1', content: 'Content 1', published: false, views: 0 });
      await adapter.create(Post, { title: 'Post 2', content: 'Content 2', published: false, views: 0 });

      const stats = await adapter.getStats();
      expect(stats.tables).toContain('post');
      expect(stats.counts.post).toBe(2);
    });

    it('should clear all data', async () => {
      await adapter.create(Post, { title: 'Post 1', content: 'Content 1', published: false, views: 0 });
      await adapter.create(Post, { title: 'Post 2', content: 'Content 2', published: false, views: 0 });

      await adapter.clearAll();

      const stats = await adapter.getStats();
      expect(stats.counts.post).toBe(0);
    });
  });

  describe('Multiple Tables', () => {
    class User extends Model {
      static tableName = 'user';

      declare id?: number;
      declare name: string;
      declare email: string;
    }

    // Initialize User model
    User.init({
      name: new CharField({ maxLength: 100 }),
      email: new CharField({ maxLength: 100 }),
    });

    beforeEach(() => {
      User.setAdapter(adapter);
    });

    it('should handle multiple tables independently', async () => {
      await adapter.create(Post, { title: 'Post 1', content: 'Content', published: false, views: 0 });
      await adapter.create(User, { name: 'John', email: 'john@example.com' });

      const posts = await adapter.find(Post, {});
      const users = await adapter.find(User, {});

      expect(posts.length).toBe(1);
      expect(users.length).toBe(1);
    });

    it('should maintain separate ID counters per table', async () => {
      const post1 = await adapter.create(Post, { title: 'Post 1', content: 'Content', published: false, views: 0 });
      const user1 = await adapter.create(User, { name: 'John', email: 'john@example.com' });
      const post2 = await adapter.create(Post, { title: 'Post 2', content: 'Content', published: false, views: 0 });

      expect((post1 as any).id).toBe(1);
      expect((user1 as any).id).toBe(1);
      expect((post2 as any).id).toBe(2);
    });

    it('should show all tables in stats', async () => {
      await adapter.create(Post, { title: 'Post 1', content: 'Content', published: false, views: 0 });
      await adapter.create(User, { name: 'John', email: 'john@example.com' });

      const stats = await adapter.getStats();
      expect(stats.tables).toContain('post');
      expect(stats.tables).toContain('user');
      expect(stats.tables.length).toBeGreaterThanOrEqual(2);
    });
  });
});
