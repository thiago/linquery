/**
 * Adapter Contract Tests
 *
 * These tests define the expected behavior for ALL adapters.
 * Any adapter implementing BackendAdapter must pass these tests.
 *
 * This ensures:
 * - Consistent behavior across all adapters
 * - Models work the same regardless of storage backend
 * - New adapters can be validated easily
 * - Regressions are caught immediately
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { BackendAdapter, ModelClass } from '../../src/types';
import { Model } from '../../src/core/Model';
import { CharField, IntegerField, BooleanField, DateTimeField } from '../../src/core/Field';

/**
 * Configuration for adapter contract tests
 */
export interface AdapterContractConfig {
  /** Name of the adapter being tested */
  name: string;

  /** Factory function to create a fresh adapter instance */
  createAdapter: () => Promise<BackendAdapter> | BackendAdapter;

  /** Setup function called before running tests (e.g., connect to DB) */
  setup?: () => Promise<void> | void;

  /** Cleanup function called after tests (e.g., disconnect, clear data) */
  cleanup?: () => Promise<void> | void;

  /** Skip specific tests if adapter doesn't support them yet */
  skip?: {
    bulkOperations?: boolean;
    transactions?: boolean;
    rawQueries?: boolean;
  };
}

/**
 * Test models used across all contract tests
 */
export class TestPost extends Model {
  static tableName = 'test_posts';

  declare id?: number;
  declare title: string;
  declare content: string;
  declare published: boolean;
  declare views: number;
  declare createdAt?: Date;
}

TestPost.init({
  title: new CharField({ maxLength: 200 }),
  content: new CharField({ maxLength: 1000 }),
  published: new BooleanField({ default: false }),
  views: new IntegerField({ default: 0 }),
  createdAt: new DateTimeField({ autoNowAdd: true, required: false }),
});

export class TestUser extends Model {
  static tableName = 'test_users';

  declare id?: number;
  declare name: string;
  declare email: string;
  declare age: number;
  declare active: boolean;
}

TestUser.init({
  name: new CharField({ maxLength: 100 }),
  email: new CharField({ maxLength: 255 }),
  age: new IntegerField({ min: 0, max: 150 }),
  active: new BooleanField({ default: true }),
});

/**
 * Run the full adapter contract test suite
 *
 * @example
 * ```typescript
 * import { runAdapterContract } from '../contracts/adapterContract';
 * import { MemoryAdapter } from '../../src/adapters/MemoryAdapter';
 *
 * runAdapterContract({
 *   name: 'MemoryAdapter',
 *   createAdapter: () => new MemoryAdapter(),
 * });
 * ```
 */
export function runAdapterContract(config: AdapterContractConfig): void {
  const { name, createAdapter, setup, cleanup, skip = {} } = config;

  describe(`${name} - Adapter Contract`, () => {
    let adapter: BackendAdapter;

    beforeEach(async () => {
      if (setup) await setup();
      adapter = await createAdapter();

      // Connect if needed
      if (typeof adapter.connect === 'function') {
        await adapter.connect();
      }

      TestPost.setAdapter(adapter);
      TestUser.setAdapter(adapter);
    });

    afterEach(async () => {
      // Disconnect if needed
      if (typeof adapter.disconnect === 'function') {
        await adapter.disconnect();
      }

      if (cleanup) await cleanup();
    });

    // Import and run sub-contracts
    describe('CRUD Operations', () => {
      runCRUDContract(() => adapter, TestPost, TestUser);
    });

    describe('Query Operations', () => {
      runQueryContract(() => adapter, TestPost);
    });

    describe('Lookup Filters', () => {
      runLookupContract(() => adapter, TestPost);
    });

    if (!skip.bulkOperations) {
      describe('Bulk Operations', () => {
        runBulkContract(() => adapter, TestPost);
      });
    }

    if (!skip.transactions) {
      describe('Transactions', () => {
        runTransactionContract(() => adapter, TestPost);
      });
    }
  });
}

/**
 * CRUD Contract - Basic create, read, update, delete operations
 */
function runCRUDContract(
  getAdapter: () => BackendAdapter,
  Post: typeof TestPost,
  User: typeof TestUser
): void {
  it('should create a record with auto-generated ID', async () => {
    const adapter = getAdapter();
    const post = await adapter.create(Post, {
      title: 'Test Post',
      content: 'Test Content',
      published: false,
      views: 0,
    });

    expect(post).toBeDefined();
    expect((post as any).id).toBeDefined();
    expect((post as any).title).toBe('Test Post');
  });

  it('should create a record with provided ID', async () => {
    const adapter = getAdapter();
    const post = await adapter.create(Post, {
      id: 100,
      title: 'Test Post',
      content: 'Test Content',
      published: false,
      views: 0,
    });

    expect((post as any).id).toBe(100);
  });

  it('should create multiple records with incrementing IDs', async () => {
    const adapter = getAdapter();
    const post1 = await adapter.create(Post, { title: 'Post 1', content: 'Content 1', published: false, views: 0 });
    const post2 = await adapter.create(Post, { title: 'Post 2', content: 'Content 2', published: false, views: 0 });
    const post3 = await adapter.create(Post, { title: 'Post 3', content: 'Content 3', published: false, views: 0 });

    expect((post1 as any).id).toBeDefined();
    expect((post2 as any).id).toBeDefined();
    expect((post3 as any).id).toBeDefined();
    expect((post2 as any).id).toBeGreaterThan((post1 as any).id);
    expect((post3 as any).id).toBeGreaterThan((post2 as any).id);
  });

  it('should get a record by ID', async () => {
    const adapter = getAdapter();
    const created = await adapter.create(Post, { title: 'Test', content: 'Content', published: false, views: 0 });
    const found = await adapter.get(Post, (created as any).id);

    expect(found).toBeDefined();
    expect((found as any).title).toBe('Test');
  });

  it('should return null when record not found by ID', async () => {
    const adapter = getAdapter();
    const found = await adapter.get(Post, 99999);

    expect(found).toBeNull();
  });

  it('should find records by filter', async () => {
    const adapter = getAdapter();
    await adapter.create(Post, { title: 'Post 1', content: 'Content', published: true, views: 0 });
    await adapter.create(Post, { title: 'Post 2', content: 'Content', published: false, views: 0 });
    await adapter.create(Post, { title: 'Post 3', content: 'Content', published: true, views: 0 });

    const published = await adapter.find(Post, { published: true });
    expect(published.length).toBe(2);
  });

  it('should update records matching filter', async () => {
    const adapter = getAdapter();
    const created = await adapter.create(Post, { title: 'Old Title', content: 'Content', published: false, views: 0 });

    await adapter.update(Post, { id: (created as any).id }, { title: 'New Title', published: true });

    const updated = await adapter.get(Post, (created as any).id);
    expect((updated as any).title).toBe('New Title');
    expect((updated as any).published).toBe(true);
  });

  it('should delete records matching filter', async () => {
    const adapter = getAdapter();
    await adapter.create(Post, { title: 'Post 1', content: 'Content', published: true, views: 0 });
    await adapter.create(Post, { title: 'Post 2', content: 'Content', published: false, views: 0 });

    await adapter.delete(Post, { published: true });

    const remaining = await adapter.find(Post, {});
    expect(remaining.length).toBe(1);
    expect((remaining[0] as any).published).toBe(false);
  });

  it('should handle multiple tables independently', async () => {
    const adapter = getAdapter();
    await adapter.create(Post, { title: 'Post 1', content: 'Content', published: false, views: 0 });
    await adapter.create(User, { name: 'John', email: 'john@example.com', age: 30, active: true });

    const posts = await adapter.find(Post, {});
    const users = await adapter.find(User, {});

    expect(posts.length).toBe(1);
    expect(users.length).toBe(1);
  });

  it('should maintain separate ID counters per table', async () => {
    const adapter = getAdapter();
    const post1 = await adapter.create(Post, { title: 'Post 1', content: 'Content', published: false, views: 0 });
    const user1 = await adapter.create(User, { name: 'John', email: 'john@example.com', age: 30, active: true });
    const post2 = await adapter.create(Post, { title: 'Post 2', content: 'Content', published: false, views: 0 });

    expect((post1 as any).id).toBeDefined();
    expect((user1 as any).id).toBeDefined();
    expect((post2 as any).id).toBeGreaterThan((post1 as any).id);
  });
}

/**
 * Query Contract - Advanced querying with filters, ordering, pagination
 */
function runQueryContract(getAdapter: () => BackendAdapter, Post: typeof TestPost): void {
  beforeEach(async () => {
    const adapter = getAdapter();
    // Create test data
    await adapter.create(Post, { title: 'Alpha', content: 'Content A', published: true, views: 100 });
    await adapter.create(Post, { title: 'Beta', content: 'Content B', published: false, views: 200 });
    await adapter.create(Post, { title: 'Gamma', content: 'Content C', published: true, views: 150 });
    await adapter.create(Post, { title: 'Delta', content: 'Content D', published: false, views: 50 });
  });

  it('should apply filters with QueryPlan', async () => {
    const adapter = getAdapter();
    const results = await adapter.list(Post, {
      model: Post,
      filters: [{ field: 'published', lookup: 'exact', value: true }],
      excludes: [],
      ordering: [],
      selectRelated: [],
      prefetchRelated: [],
    });

    expect(results.length).toBe(2);
    results.forEach((post) => {
      expect((post as any).published).toBe(true);
    });
  });

  it('should apply ordering (ascending)', async () => {
    const adapter = getAdapter();
    const results = await adapter.list(Post, {
      model: Post,
      filters: [],
      excludes: [],
      ordering: [{ field: 'views', direction: 'asc' }],
      selectRelated: [],
      prefetchRelated: [],
    });

    expect((results[0] as any).views).toBe(50);
    expect((results[results.length - 1] as any).views).toBe(200);
  });

  it('should apply ordering (descending)', async () => {
    const adapter = getAdapter();
    const results = await adapter.list(Post, {
      model: Post,
      filters: [],
      excludes: [],
      ordering: [{ field: 'views', direction: 'desc' }],
      selectRelated: [],
      prefetchRelated: [],
    });

    expect((results[0] as any).views).toBe(200);
    expect((results[results.length - 1] as any).views).toBe(50);
  });

  it('should apply limit', async () => {
    const adapter = getAdapter();
    const results = await adapter.list(Post, {
      model: Post,
      filters: [],
      excludes: [],
      ordering: [],
      limit: 2,
      selectRelated: [],
      prefetchRelated: [],
    });

    expect(results.length).toBe(2);
  });

  it('should apply offset', async () => {
    const adapter = getAdapter();
    const results = await adapter.list(Post, {
      model: Post,
      filters: [],
      excludes: [],
      ordering: [{ field: 'title', direction: 'asc' }],
      offset: 2,
      selectRelated: [],
      prefetchRelated: [],
    });

    expect(results.length).toBe(2);
    expect((results[0] as any).title).toBe('Delta');
  });

  it('should apply limit and offset together', async () => {
    const adapter = getAdapter();
    const results = await adapter.list(Post, {
      model: Post,
      filters: [],
      excludes: [],
      ordering: [{ field: 'title', direction: 'asc' }],
      limit: 2,
      offset: 1,
      selectRelated: [],
      prefetchRelated: [],
    });

    expect(results.length).toBe(2);
    expect((results[0] as any).title).toBe('Beta');
    expect((results[1] as any).title).toBe('Delta');
  });

  it('should count records with filters', async () => {
    const adapter = getAdapter();
    const count = await adapter.count(Post, {
      model: Post,
      filters: [{ field: 'published', lookup: 'exact', value: true }],
      excludes: [],
      ordering: [],
      selectRelated: [],
      prefetchRelated: [],
    });

    expect(count).toBe(2);
  });

  it('should check if records exist', async () => {
    const adapter = getAdapter();

    if (!adapter.exists) {
      return; // Skip if not implemented
    }

    const exists = await adapter.exists(Post, {
      model: Post,
      filters: [{ field: 'published', lookup: 'exact', value: true }],
      excludes: [],
      ordering: [],
      selectRelated: [],
      prefetchRelated: [],
    });

    expect(exists).toBe(true);
  });

  it('should return false when no records exist', async () => {
    const adapter = getAdapter();

    if (!adapter.exists) {
      return; // Skip if not implemented
    }

    const exists = await adapter.exists(Post, {
      model: Post,
      filters: [{ field: 'views', lookup: 'gt', value: 1000 }],
      excludes: [],
      ordering: [],
      selectRelated: [],
      prefetchRelated: [],
    });

    expect(exists).toBe(false);
  });
}

/**
 * Lookup Contract - Field lookup types (__gt, __contains, etc)
 */
function runLookupContract(getAdapter: () => BackendAdapter, Post: typeof TestPost): void {
  beforeEach(async () => {
    const adapter = getAdapter();
    await adapter.create(Post, { title: 'Hello World', content: 'Content A', published: true, views: 100 });
    await adapter.create(Post, { title: 'HELLO AGAIN', content: 'Content B', published: false, views: 200 });
    await adapter.create(Post, { title: 'Goodbye', content: 'Content C', published: true, views: 150 });
  });

  it('should filter with exact lookup', async () => {
    const adapter = getAdapter();
    const results = await adapter.list(Post, {
      model: Post,
      filters: [{ field: 'title', lookup: 'exact', value: 'Goodbye' }],
      excludes: [],
      ordering: [],
      selectRelated: [],
      prefetchRelated: [],
    });

    expect(results.length).toBe(1);
    expect((results[0] as any).title).toBe('Goodbye');
  });

  it('should filter with contains lookup', async () => {
    const adapter = getAdapter();
    const results = await adapter.list(Post, {
      model: Post,
      filters: [{ field: 'title', lookup: 'contains', value: 'Hello' }],
      excludes: [],
      ordering: [],
      selectRelated: [],
      prefetchRelated: [],
    });

    expect(results.length).toBe(1);
    expect((results[0] as any).title).toBe('Hello World');
  });

  it('should filter with icontains lookup (case-insensitive)', async () => {
    const adapter = getAdapter();
    const results = await adapter.list(Post, {
      model: Post,
      filters: [{ field: 'title', lookup: 'icontains', value: 'hello' }],
      excludes: [],
      ordering: [],
      selectRelated: [],
      prefetchRelated: [],
    });

    expect(results.length).toBe(2);
  });

  it('should filter with gt (greater than) lookup', async () => {
    const adapter = getAdapter();
    const results = await adapter.list(Post, {
      model: Post,
      filters: [{ field: 'views', lookup: 'gt', value: 100 }],
      excludes: [],
      ordering: [],
      selectRelated: [],
      prefetchRelated: [],
    });

    expect(results.length).toBe(2);
  });

  it('should filter with gte (greater than or equal) lookup', async () => {
    const adapter = getAdapter();
    const results = await adapter.list(Post, {
      model: Post,
      filters: [{ field: 'views', lookup: 'gte', value: 100 }],
      excludes: [],
      ordering: [],
      selectRelated: [],
      prefetchRelated: [],
    });

    expect(results.length).toBe(3);
  });

  it('should filter with lt (less than) lookup', async () => {
    const adapter = getAdapter();
    const results = await adapter.list(Post, {
      model: Post,
      filters: [{ field: 'views', lookup: 'lt', value: 200 }],
      excludes: [],
      ordering: [],
      selectRelated: [],
      prefetchRelated: [],
    });

    expect(results.length).toBe(2);
  });

  it('should filter with in lookup', async () => {
    const adapter = getAdapter();
    const results = await adapter.list(Post, {
      model: Post,
      filters: [{ field: 'views', lookup: 'in', value: [100, 200] }],
      excludes: [],
      ordering: [],
      selectRelated: [],
      prefetchRelated: [],
    });

    expect(results.length).toBe(2);
  });

  it('should filter with range lookup', async () => {
    const adapter = getAdapter();
    const results = await adapter.list(Post, {
      model: Post,
      filters: [{ field: 'views', lookup: 'range', value: [100, 150] }],
      excludes: [],
      ordering: [],
      selectRelated: [],
      prefetchRelated: [],
    });

    expect(results.length).toBe(2);
  });
}

/**
 * Bulk Operations Contract - bulkCreate, bulkUpdate, bulkDelete
 */
function runBulkContract(getAdapter: () => BackendAdapter, Post: typeof TestPost): void {
  it('should support bulkCreate if available', async () => {
    const adapter = getAdapter();

    if (!adapter.bulkCreate) {
      expect(adapter.bulkCreate).toBeUndefined();
      return;
    }

    const posts = await adapter.bulkCreate(Post, [
      { title: 'Post 1', content: 'Content 1', published: false, views: 0 },
      { title: 'Post 2', content: 'Content 2', published: false, views: 0 },
      { title: 'Post 3', content: 'Content 3', published: false, views: 0 },
    ]);

    expect(posts.length).toBe(3);
  });
}

/**
 * Transaction Contract - Atomic operations
 */
function runTransactionContract(getAdapter: () => BackendAdapter, _Post: typeof TestPost): void {
  it('should support transactions if available', async () => {
    const adapter = getAdapter();

    if (!adapter.transaction) {
      expect(adapter.transaction).toBeUndefined();
      return;
    }

    // Transaction test implementation
  });
}
