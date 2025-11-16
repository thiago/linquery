/**
 * SQLiteAdapter E2E Tests - SQL.js (Browser WASM)
 *
 * Tests the SqlJsEngine implementation using SQL.js WASM library
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import initSqlJs from 'sql.js';
import { SQLiteAdapter, SqlJsEngine } from '../../src/adapters/SQLiteAdapter';
import { Model } from '../../src/core/Model';
import { CharField, IntegerField, BooleanField, DateTimeField } from '../../src/core/Field';

describe('SQLiteAdapter E2E - SQL.js (Browser)', () => {
  let SQL: any;
  let db: any;
  let adapter: SQLiteAdapter;

  beforeEach(async () => {
    // Initialize SQL.js WASM
    SQL = await initSqlJs();
    db = new SQL.Database();
    const engine = new SqlJsEngine(db);
    adapter = new SQLiteAdapter(engine, { autoSchema: true });
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  describe('Auto Schema Generation', () => {
    it('should auto-generate schema from Model', async () => {
      class Post extends Model {
        static tableName = 'posts';
        declare id?: number;
        declare title: string;
        declare slug: string;
        declare published: boolean;
      }

      Post.init({
        title: new CharField({ maxLength: 200 }),
        slug: new CharField({ maxLength: 200, unique: true, index: true }),
        published: new BooleanField({ default: false }),
      });

      Post.setAdapter(adapter);
      await adapter.connect();

      // Create a record
      const post = await adapter.create(Post, {
        title: 'Test Post',
        slug: 'test-post',
        published: true,
      });

      expect(post).toBeDefined();
      expect((post as any).id).toBe(1);
      expect((post as any).title).toBe('Test Post');
      expect((post as any).published).toBe(true);
    });

    it('should handle multiple models', async () => {
      class Post extends Model {
        static tableName = 'posts';
        declare id?: number;
        declare title: string;
      }

      Post.init({
        title: new CharField({ maxLength: 200 }),
      });

      class User extends Model {
        static tableName = 'users';
        declare id?: number;
        declare email: string;
      }

      User.init({
        email: new CharField({ maxLength: 100, unique: true }),
      });

      Post.setAdapter(adapter);
      User.setAdapter(adapter);
      await adapter.connect();

      const post = await adapter.create(Post, { title: 'Post 1' });
      const user = await adapter.create(User, { email: 'user@example.com' });

      expect(post).toBeDefined();
      expect(user).toBeDefined();
      expect((post as any).id).toBe(1);
      expect((user as any).id).toBe(1);
    });
  });

  describe('CRUD Operations', () => {
    class TestModel extends Model {
      static tableName = 'test_items';
      declare id?: number;
      declare name: string;
      declare value: number;
      declare active: boolean;
    }

    beforeEach(async () => {
      TestModel.init({
        name: new CharField({ maxLength: 100 }),
        value: new IntegerField({ default: 0 }),
        active: new BooleanField({ default: true }),
      });

      TestModel.setAdapter(adapter);
      await adapter.connect();
    });

    it('should create a record', async () => {
      const item = await adapter.create(TestModel, {
        name: 'Test Item',
        value: 42,
        active: true,
      });

      expect(item).toBeDefined();
      expect((item as any).id).toBe(1);
      expect((item as any).name).toBe('Test Item');
      expect((item as any).value).toBe(42);
      expect((item as any).active).toBe(true);
    });

    it('should get a record by ID', async () => {
      await adapter.create(TestModel, { name: 'Item 1', value: 10, active: true });

      const item = await adapter.get(TestModel, 1);

      expect(item).toBeDefined();
      expect((item as any).name).toBe('Item 1');
    });

    it('should return null for non-existent ID', async () => {
      const item = await adapter.get(TestModel, 999);
      expect(item).toBeNull();
    });

    it('should find records by filter', async () => {
      await adapter.create(TestModel, { name: 'Active Item', value: 10, active: true });
      await adapter.create(TestModel, { name: 'Inactive Item', value: 20, active: false });
      await adapter.create(TestModel, { name: 'Another Active', value: 30, active: true });

      const items = await adapter.find(TestModel, { active: true });

      expect(items).toHaveLength(2);
      expect((items[0] as any).name).toBe('Active Item');
      expect((items[1] as any).name).toBe('Another Active');
    });

    it('should update records', async () => {
      await adapter.create(TestModel, { name: 'Old Name', value: 10, active: true });

      await adapter.update(TestModel, { id: 1 }, { name: 'New Name', value: 20 });

      const item = await adapter.get(TestModel, 1);
      expect((item as any).name).toBe('New Name');
      expect((item as any).value).toBe(20);
    });

    it('should delete records', async () => {
      await adapter.create(TestModel, { name: 'To Delete', value: 10, active: true });

      await adapter.delete(TestModel, { id: 1 });

      const item = await adapter.get(TestModel, 1);
      expect(item).toBeNull();
    });
  });

  describe('Field Type Conversions', () => {
    class TypeTestModel extends Model {
      static tableName = 'type_tests';
      declare id?: number;
      declare flag: boolean;
      declare created: Date;
      declare count: number;
    }

    beforeEach(async () => {
      TypeTestModel.init({
        flag: new BooleanField(),
        created: new DateTimeField(),
        count: new IntegerField(),
      });

      TypeTestModel.setAdapter(adapter);
      await adapter.connect();
    });

    it('should convert boolean to SQLite INTEGER', async () => {
      const item = await adapter.create(TypeTestModel, {
        flag: true,
        created: new Date('2024-01-01'),
        count: 42,
      });

      expect((item as any).flag).toBe(true);
    });

    it('should convert Date to ISO string in SQLite', async () => {
      const date = new Date('2024-01-01T12:00:00Z');
      const item = await adapter.create(TypeTestModel, {
        flag: false,
        created: date,
        count: 10,
      });

      expect((item as any).created).toBeInstanceOf(Date);
      expect((item as any).created.toISOString()).toBe(date.toISOString());
    });
  });

  describe('Query Plan (Advanced Queries)', () => {
    class QueryModel extends Model {
      static tableName = 'query_items';
      declare id?: number;
      declare title: string;
      declare views: number;
      declare published: boolean;
    }

    beforeEach(async () => {
      QueryModel.init({
        title: new CharField({ maxLength: 200 }),
        views: new IntegerField({ default: 0 }),
        published: new BooleanField({ default: false }),
      });

      QueryModel.setAdapter(adapter);
      await adapter.connect();

      // Create test data
      await adapter.create(QueryModel, { title: 'Post 1', views: 100, published: true });
      await adapter.create(QueryModel, { title: 'Post 2', views: 200, published: false });
      await adapter.create(QueryModel, { title: 'Post 3', views: 300, published: true });
      await adapter.create(QueryModel, { title: 'Draft 1', views: 50, published: false });
    });

    it('should filter with gt lookup', async () => {
      const items = await adapter.list(QueryModel, {
        filters: [{ field: 'views', lookup: 'gt', value: 150 }],
        excludes: [],
        ordering: [],
      });

      expect(items).toHaveLength(2);
      expect((items[0] as any).views).toBe(200);
      expect((items[1] as any).views).toBe(300);
    });

    it('should filter with contains lookup', async () => {
      const items = await adapter.list(QueryModel, {
        filters: [{ field: 'title', lookup: 'contains', value: 'Post' }],
        excludes: [],
        ordering: [],
      });

      expect(items).toHaveLength(3);
    });

    it('should apply ordering ASC', async () => {
      const items = await adapter.list(QueryModel, {
        filters: [],
        excludes: [],
        ordering: [{ field: 'views', direction: 'asc' }],
      });

      expect((items[0] as any).views).toBe(50);
      expect((items[1] as any).views).toBe(100);
      expect((items[2] as any).views).toBe(200);
      expect((items[3] as any).views).toBe(300);
    });

    it('should apply ordering DESC', async () => {
      const items = await adapter.list(QueryModel, {
        filters: [],
        excludes: [],
        ordering: [{ field: 'views', direction: 'desc' }],
      });

      expect((items[0] as any).views).toBe(300);
      expect((items[1] as any).views).toBe(200);
      expect((items[2] as any).views).toBe(100);
      expect((items[3] as any).views).toBe(50);
    });

    it('should apply limit', async () => {
      const items = await adapter.list(QueryModel, {
        filters: [],
        excludes: [],
        ordering: [{ field: 'views', direction: 'desc' }],
        limit: 2,
      });

      expect(items).toHaveLength(2);
      expect((items[0] as any).views).toBe(300);
      expect((items[1] as any).views).toBe(200);
    });

    it('should count records', async () => {
      const count = await adapter.count(QueryModel, {
        filters: [{ field: 'published', lookup: 'exact', value: true }],
        excludes: [],
        ordering: [],
      });

      expect(count).toBe(2);
    });

    it('should check if records exist', async () => {
      const exists = await adapter.exists(QueryModel, {
        filters: [{ field: 'views', lookup: 'gt', value: 250 }],
        excludes: [],
        ordering: [],
      });

      expect(exists).toBe(true);

      const notExists = await adapter.exists(QueryModel, {
        filters: [{ field: 'views', lookup: 'gt', value: 500 }],
        excludes: [],
        ordering: [],
      });

      expect(notExists).toBe(false);
    });
  });

  describe('SQL.js Specific Features', () => {
    it('should export database to Uint8Array', async () => {
      class Post extends Model {
        static tableName = 'posts';
        declare id?: number;
        declare title: string;
      }

      Post.init({
        title: new CharField({ maxLength: 200 }),
      });

      Post.setAdapter(adapter);
      await adapter.connect();

      // Create some data
      await adapter.create(Post, { title: 'Post 1' });
      await adapter.create(Post, { title: 'Post 2' });

      // Export database
      const engine = new SqlJsEngine(db);
      const exported = engine.export();

      expect(exported).toBeInstanceOf(Uint8Array);
      expect(exported.length).toBeGreaterThan(0);
    });

    it('should load database from Uint8Array', async () => {
      class Post extends Model {
        static tableName = 'posts';
        declare id?: number;
        declare title: string;
      }

      Post.init({
        title: new CharField({ maxLength: 200 }),
      });

      Post.setAdapter(adapter);
      await adapter.connect();

      // Create data
      await adapter.create(Post, { title: 'Original Post' });

      // Export
      const engine = new SqlJsEngine(db);
      const exported = engine.export();

      // Create new database from export
      const newDb = new SQL.Database(exported);
      const newEngine = new SqlJsEngine(newDb);
      const newAdapter = new SQLiteAdapter(newEngine);

      Post.setAdapter(newAdapter);
      await newAdapter.connect();

      // Verify data persisted
      const posts = await newAdapter.find(Post, {});
      expect(posts).toHaveLength(1);
      expect((posts[0] as any).title).toBe('Original Post');

      await newAdapter.disconnect();
    });
  });

  describe('Transactions', () => {
    class TransactionModel extends Model {
      static tableName = 'transaction_items';
      declare id?: number;
      declare value: number;
    }

    beforeEach(async () => {
      TransactionModel.init({
        value: new IntegerField(),
      });

      TransactionModel.setAdapter(adapter);
      await adapter.connect();
    });

    it('should support transactions', async () => {
      const engine = new SqlJsEngine(db);

      engine.transaction(() => {
        engine.run('INSERT INTO transaction_items (value) VALUES (?)', [100]);
        engine.run('INSERT INTO transaction_items (value) VALUES (?)', [200]);
      });

      const items = await adapter.find(TransactionModel, {});
      expect(items).toHaveLength(2);
    });

    it('should rollback on error', async () => {
      const engine = new SqlJsEngine(db);

      try {
        engine.transaction(() => {
          engine.run('INSERT INTO transaction_items (value) VALUES (?)', [100]);
          throw new Error('Simulated error');
        });
      } catch {
        // Expected error
      }

      const items = await adapter.find(TransactionModel, {});
      expect(items).toHaveLength(0);
    });
  });
});
