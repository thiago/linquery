/**
 * E2E Tests for expo-sqlite
 * These tests run inside a React Native app
 */

import * as SQLite from 'expo-sqlite';
import { SQLiteAdapter, ExpoSQLiteEngine } from '../../../../src/adapters/SQLiteAdapter';
import { Model } from '../../../../src/core/Model';
import { CharField, IntegerField, BooleanField } from '../../../../src/core/Field';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

// Helper to run a single test
async function runTest(name: string, testFn: () => Promise<void>): Promise<TestResult> {
  try {
    await testFn();
    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Setup
  const db = SQLite.openDatabaseSync('test.db');
  const engine = new ExpoSQLiteEngine(db);
  const adapter = new SQLiteAdapter(engine, {
    autoSchema: true,
    clearOnConnect: true
  });

  // Test 1: Auto-generate schema
  results.push(
    await runTest('should auto-generate schema from Model', async () => {
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

      const post = await adapter.create(Post, {
        title: 'Test Post',
        slug: 'test-post',
        published: true,
      });

      if (!post) throw new Error('Post not created');
      if ((post as any).id !== 1) throw new Error('ID should be 1');
      if ((post as any).title !== 'Test Post') throw new Error('Title mismatch');
      if ((post as any).published !== true) throw new Error('Published should be true');
    })
  );

  // Reset for next test
  db.closeSync();
  const db2 = SQLite.openDatabaseSync('test2.db');
  const engine2 = new ExpoSQLiteEngine(db2);
  const adapter2 = new SQLiteAdapter(engine2, {
    autoSchema: true,
    clearOnConnect: true
  });

  // Test 2: CRUD operations
  results.push(
    await runTest('should create a record', async () => {
      class TestModel extends Model {
        static tableName = 'test_items';
        declare id?: number;
        declare name: string;
        declare value: number;
      }

      TestModel.init({
        name: new CharField({ maxLength: 100 }),
        value: new IntegerField({ default: 0 }),
      });

      TestModel.setAdapter(adapter2);
      await adapter2.connect();

      const item = await adapter2.create(TestModel, {
        name: 'Test Item',
        value: 42,
      });

      if (!item) throw new Error('Item not created');
      if ((item as any).id !== 1) throw new Error('ID should be 1');
      if ((item as any).name !== 'Test Item') throw new Error('Name mismatch');
      if ((item as any).value !== 42) throw new Error('Value mismatch');
    })
  );

  // Test 3: Get by ID
  results.push(
    await runTest('should get a record by ID', async () => {
      class TestModel extends Model {
        static tableName = 'test_items';
        declare id?: number;
        declare name: string;
        declare value: number;
      }

      TestModel.init({
        name: new CharField({ maxLength: 100 }),
        value: new IntegerField({ default: 0 }),
      });

      const item = await adapter2.get(TestModel, 1);

      if (!item) throw new Error('Item not found');
      if ((item as any).name !== 'Test Item') throw new Error('Name mismatch');
    })
  );

  // Reset for filter test
  db2.closeSync();
  const db3 = SQLite.openDatabaseSync('test3.db');
  const engine3 = new ExpoSQLiteEngine(db3);
  const adapter3 = new SQLiteAdapter(engine3, {
    autoSchema: true,
    clearOnConnect: true
  });

  // Test 4: Find records
  results.push(
    await runTest('should find records by filter', async () => {
      class TestModel extends Model {
        static tableName = 'test_items';
        declare id?: number;
        declare name: string;
        declare active: boolean;
      }

      TestModel.init({
        name: new CharField({ maxLength: 100 }),
        active: new BooleanField({ default: true }),
      });

      TestModel.setAdapter(adapter3);
      await adapter3.connect();

      await adapter3.create(TestModel, { name: 'Active Item', active: true });
      await adapter3.create(TestModel, { name: 'Inactive Item', active: false });
      await adapter3.create(TestModel, { name: 'Another Active', active: true });

      const items = await adapter3.find(TestModel, { active: true });

      if (items.length !== 2) throw new Error(`Expected 2 items, got ${items.length}`);
      if ((items[0] as any).name !== 'Active Item') throw new Error('First item name mismatch');
      if ((items[1] as any).name !== 'Another Active') throw new Error('Second item name mismatch');
    })
  );

  // Test 5: Update
  results.push(
    await runTest('should update records', async () => {
      class TestModel extends Model {
        static tableName = 'test_items';
        declare id?: number;
        declare name: string;
      }

      await adapter3.update(TestModel, { id: 1 }, { name: 'Updated Name' });

      const item = await adapter3.get(TestModel, 1);
      if ((item as any).name !== 'Updated Name') throw new Error('Name not updated');
    })
  );

  // Test 6: Delete
  results.push(
    await runTest('should delete records', async () => {
      class TestModel extends Model {
        static tableName = 'test_items';
        declare id?: number;
        declare name: string;
      }

      await adapter3.delete(TestModel, { id: 1 });

      const item = await adapter3.get(TestModel, 1);
      if (item !== null) throw new Error('Item should be deleted');
    })
  );

  // Reset for query test
  db3.closeSync();
  const db4 = SQLite.openDatabaseSync('test4.db');
  const engine4 = new ExpoSQLiteEngine(db4);
  const adapter4 = new SQLiteAdapter(engine4, {
    autoSchema: true,
    clearOnConnect: true
  });

  // Test 7: Advanced queries
  results.push(
    await runTest('should filter with gt lookup', async () => {
      class QueryModel extends Model {
        static tableName = 'query_items';
        declare id?: number;
        declare views: number;
      }

      QueryModel.init({
        views: new IntegerField({ default: 0 }),
      });

      QueryModel.setAdapter(adapter4);
      await adapter4.connect();

      await adapter4.create(QueryModel, { views: 100 });
      await adapter4.create(QueryModel, { views: 200 });
      await adapter4.create(QueryModel, { views: 300 });

      const items = await adapter4.list(QueryModel, {
        filters: [{ field: 'views', lookup: 'gt', value: 150 }],
        excludes: [],
        ordering: [],
      });

      if (items.length !== 2) throw new Error(`Expected 2 items, got ${items.length}`);
      if ((items[0] as any).views !== 200) throw new Error('First item views mismatch');
      if ((items[1] as any).views !== 300) throw new Error('Second item views mismatch');
    })
  );

  // Test 8: Ordering
  results.push(
    await runTest('should apply ordering DESC', async () => {
      class QueryModel extends Model {
        static tableName = 'query_items';
        declare id?: number;
        declare views: number;
      }

      const items = await adapter4.list(QueryModel, {
        filters: [],
        excludes: [],
        ordering: [{ field: 'views', direction: 'desc' }],
      });

      if (items.length !== 3) throw new Error(`Expected 3 items, got ${items.length}`);
      if ((items[0] as any).views !== 300) throw new Error('First should be 300');
      if ((items[1] as any).views !== 200) throw new Error('Second should be 200');
      if ((items[2] as any).views !== 100) throw new Error('Third should be 100');
    })
  );

  // Test 9: Limit
  results.push(
    await runTest('should apply limit', async () => {
      class QueryModel extends Model {
        static tableName = 'query_items';
        declare id?: number;
        declare views: number;
      }

      const items = await adapter4.list(QueryModel, {
        filters: [],
        excludes: [],
        ordering: [{ field: 'views', direction: 'desc' }],
        limit: 2,
      });

      if (items.length !== 2) throw new Error(`Expected 2 items, got ${items.length}`);
      if ((items[0] as any).views !== 300) throw new Error('First should be 300');
      if ((items[1] as any).views !== 200) throw new Error('Second should be 200');
    })
  );

  // Test 10: Count
  results.push(
    await runTest('should count records', async () => {
      class QueryModel extends Model {
        static tableName = 'query_items';
        declare id?: number;
        declare views: number;
      }

      const count = await adapter4.count(QueryModel, {
        filters: [{ field: 'views', lookup: 'gt', value: 150 }],
        excludes: [],
        ordering: [],
      });

      if (count !== 2) throw new Error(`Expected count 2, got ${count}`);
    })
  );

  // Cleanup
  db4.closeSync();

  return results;
}
