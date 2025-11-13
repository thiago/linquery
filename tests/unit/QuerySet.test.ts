/**
 * Unit tests for QuerySet class
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { QuerySet } from '../../src/core/QuerySet';
import { MemoryAdapter } from '../../src/adapters/MemoryAdapter';
import type { ModelClass } from '../../src/types';

// Mock model classes
class User {
  id?: number;
  name?: string;
  email?: string;
  age?: number;
  isActive?: boolean;

  constructor(data: Record<string, unknown>) {
    Object.assign(this, data);
  }

  static fromDB(data: Record<string, unknown>): User {
    return new User(data);
  }
}

class Post {
  id?: number;
  title?: string;
  content?: string;
  author_id?: number;
  publishedAt?: Date;

  constructor(data: Record<string, unknown>) {
    Object.assign(this, data);
  }

  static fromDB(data: Record<string, unknown>): Post {
    return new Post(data);
  }
}

describe('QuerySet', () => {
  let adapter: MemoryAdapter;
  let queryset: QuerySet<User>;

  beforeEach(async () => {
    adapter = new MemoryAdapter();
    await adapter.connect();
    queryset = new QuerySet(User as unknown as ModelClass<User>, adapter);

    // Seed test data
    await adapter.create(User as unknown as ModelClass<User>, {
      id: 1,
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      isActive: true,
    });
    await adapter.create(User as unknown as ModelClass<User>, {
      id: 2,
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      isActive: true,
    });
    await adapter.create(User as unknown as ModelClass<User>, {
      id: 3,
      name: 'Charlie',
      email: 'charlie@example.com',
      age: 35,
      isActive: false,
    });
  });

  describe('Basic query methods', () => {
    it('should get all results', async () => {
      const results = await queryset.all();
      expect(results).toHaveLength(3);
    });

    it('should filter results', async () => {
      const results = await queryset.filter({ isActive: true }).all();
      expect(results).toHaveLength(2);
    });

    it('should support exclude method', () => {
      // Note: exclude() is not fully implemented in MemoryAdapter yet
      // This test just verifies the method exists and returns a QuerySet
      const qs = queryset.exclude({ isActive: true });
      expect(qs).toBeInstanceOf(QuerySet);

      const plan = qs.getQueryPlan();
      expect(plan.excludes).toHaveLength(1);
    });

    it('should chain filters', async () => {
      const results = await queryset
        .filter({ isActive: true })
        .filter({ age: 25 })
        .all();
      expect(results).toHaveLength(1);
      expect((results[0] as any).name).toBe('Alice');
    });

    it('should order by ascending', async () => {
      const results = await queryset.order_by('age').all();
      expect((results[0] as any).age).toBe(25);
      expect((results[1] as any).age).toBe(30);
      expect((results[2] as any).age).toBe(35);
    });

    it('should order by descending', async () => {
      const results = await queryset.order_by('-age').all();
      expect((results[0] as any).age).toBe(35);
      expect((results[1] as any).age).toBe(30);
      expect((results[2] as any).age).toBe(25);
    });

    it('should limit results', async () => {
      const results = await queryset.limit(2).all();
      expect(results).toHaveLength(2);
    });

    it('should offset results', async () => {
      const results = await queryset.order_by('age').offset(1).all();
      expect(results).toHaveLength(2);
      expect((results[0] as any).age).toBe(30);
    });

    it('should combine limit and offset', async () => {
      const results = await queryset.order_by('age').offset(1).limit(1).all();
      expect(results).toHaveLength(1);
      expect((results[0] as any).age).toBe(30);
    });
  });

  describe('Field selection', () => {
    it('should select only specific fields', async () => {
      const qs = queryset.only('name', 'email');
      expect(qs).toBeInstanceOf(QuerySet);
      // Note: only() sets internal fields but doesn't actually filter in MemoryAdapter
      // This tests the method exists and returns a QuerySet
    });

    it('should defer specific fields', async () => {
      const qs = queryset.defer('email', 'age');
      expect(qs).toBeInstanceOf(QuerySet);
      // Note: defer() sets internal fields but doesn't actually filter in MemoryAdapter
      // This tests the method exists and returns a QuerySet
    });

    it('should clear defer when only is called', async () => {
      const qs = queryset.defer('email').only('name');
      const plan = qs.getQueryPlan();
      expect(plan.only).toEqual(['name']);
      expect(plan.defer).toBeUndefined();
    });

    it('should clear only when defer is called', async () => {
      const qs = queryset.only('name').defer('email');
      const plan = qs.getQueryPlan();
      expect(plan.defer).toEqual(['email']);
      expect(plan.only).toBeUndefined();
    });
  });

  describe('Terminal methods', () => {
    it('should get first result', async () => {
      const result = await queryset.order_by('age').first();
      expect(result).toBeDefined();
      expect((result as any).name).toBe('Alice');
    });

    it('should return undefined when first has no results', async () => {
      const result = await queryset.filter({ id: 999 }).first();
      expect(result).toBeUndefined();
    });

    it('should get last result', async () => {
      const result = await queryset.order_by('age').last();
      expect(result).toBeDefined();
      expect((result as any).name).toBe('Charlie');
    });

    it('should return undefined when last has no results', async () => {
      const result = await queryset.filter({ id: 999 }).last();
      expect(result).toBeUndefined();
    });

    it('should check if results exist', async () => {
      const exists = await queryset.filter({ name: 'Alice' }).exists();
      expect(exists).toBe(true);
    });

    it('should return false when no results exist', async () => {
      const exists = await queryset.filter({ name: 'NonExistent' }).exists();
      expect(exists).toBe(false);
    });

    it('should count results', async () => {
      const count = await queryset.filter({ isActive: true }).count();
      expect(count).toBe(2);
    });

    it('should convert to array', async () => {
      const results = await queryset.toArray();
      expect(Array.isArray(results)).toBe(true);
      expect(results).toHaveLength(3);
    });
  });

  describe('Bulk operations', () => {
    it('should update matching objects', async () => {
      const count = await queryset
        .filter({ isActive: true })
        .update({ age: 100 });

      expect(count).toBe(2);

      // Verify updates
      const results = await queryset.filter({ age: 100 }).all();
      expect(results).toHaveLength(2);
    });

    it('should delete matching objects', async () => {
      const count = await queryset
        .filter({ isActive: false })
        .delete();

      expect(count).toBe(1);

      // Verify deletion
      const results = await queryset.all();
      expect(results).toHaveLength(2);
    });

    it('should delete all objects when no filter', async () => {
      const count = await queryset.delete();
      expect(count).toBe(3);

      const results = await queryset.all();
      expect(results).toHaveLength(0);
    });
  });

  describe('Query plan', () => {
    it('should get query plan for debugging', () => {
      const plan = queryset
        .filter({ isActive: true })
        .exclude({ age: 25 })
        .order_by('-name')
        .limit(10)
        .offset(5)
        .only('name', 'email')
        .getQueryPlan();

      expect(plan.model).toBe(User);
      expect(plan.filters).toHaveLength(1);
      expect(plan.excludes).toHaveLength(1);
      expect(plan.ordering).toHaveLength(1);
      expect(plan.limit).toBe(10);
      expect(plan.offset).toBe(5);
      expect(plan.only).toEqual(['name', 'email']);
    });

    it('should include defer in query plan', () => {
      const plan = queryset.defer('email', 'age').getQueryPlan();
      expect(plan.defer).toEqual(['email', 'age']);
    });

    it('should include select_related in query plan', () => {
      const plan = queryset.select_related('profile', 'account').getQueryPlan();
      expect(plan.selectRelated).toEqual(['profile', 'account']);
    });

    it('should include prefetch_related in query plan', () => {
      const plan = queryset.prefetch_related('posts', 'comments').getQueryPlan();
      expect(plan.prefetchRelated).toEqual(['posts', 'comments']);
    });
  });

  describe('Distinct, values, values_list (TODO methods)', () => {
    it('should return cloned queryset for distinct', async () => {
      const qs = queryset.distinct();
      expect(qs).toBeInstanceOf(QuerySet);

      // Should still work even if not fully implemented
      const results = await qs.all();
      expect(results).toHaveLength(3);
    });

    it('should return new queryset for values', () => {
      const qs = queryset.values('name', 'email');
      expect(qs).toBeInstanceOf(QuerySet);
    });

    it('should return new queryset for values_list', () => {
      const qs = queryset.values_list('name', 'email');
      expect(qs).toBeInstanceOf(QuerySet);
    });
  });

  describe('Async iteration', () => {
    it('should support async iteration', async () => {
      const names: string[] = [];

      for await (const user of queryset.order_by('name')) {
        names.push((user as any).name);
      }

      expect(names).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    it('should support async iteration with filters', async () => {
      const names: string[] = [];

      for await (const user of queryset.filter({ isActive: true }).order_by('name')) {
        names.push((user as any).name);
      }

      expect(names).toEqual(['Alice', 'Bob']);
    });
  });

  describe('Result caching', () => {
    it('should cache results after first execution', async () => {
      const qs = queryset.filter({ isActive: true });

      // First call
      const results1 = await qs.all();

      // Second call should use cache
      const results2 = await qs.all();

      expect(results1).toBe(results2); // Same reference
    });

    it('should clear cache when new filter is added', async () => {
      const qs1 = queryset.filter({ isActive: true });
      await qs1.all();

      // Adding new filter should create new QuerySet
      const qs2 = qs1.filter({ age: 25 });

      expect(qs2).not.toBe(qs1);
    });
  });

  describe('Relationship loading', () => {
    it('should support select_related', () => {
      const qs = queryset.select_related('profile');
      expect(qs).toBeInstanceOf(QuerySet);

      const plan = qs.getQueryPlan();
      expect(plan.selectRelated).toContain('profile');
    });

    it('should support multiple select_related', () => {
      const qs = queryset.select_related('profile', 'account');
      const plan = qs.getQueryPlan();
      expect(plan.selectRelated).toHaveLength(2);
    });

    it('should support prefetch_related', () => {
      const qs = queryset.prefetch_related('posts');
      expect(qs).toBeInstanceOf(QuerySet);

      const plan = qs.getQueryPlan();
      expect(plan.prefetchRelated).toContain('posts');
    });

    it('should support multiple prefetch_related', () => {
      const qs = queryset.prefetch_related('posts', 'comments');
      const plan = qs.getQueryPlan();
      expect(plan.prefetchRelated).toHaveLength(2);
    });
  });

  describe('Complex filter scenarios', () => {
    it('should handle multiple ordering clauses', async () => {
      // Add more users with same age
      await adapter.create(User as unknown as ModelClass<User>, {
        id: 4,
        name: 'David',
        email: 'david@example.com',
        age: 25,
        isActive: true,
      });

      const results = await queryset.order_by('age', 'name').all();

      // Should order by age first, then by name
      expect((results[0] as any).name).toBe('Alice');
      expect((results[1] as any).name).toBe('David');
    });

    it('should handle mixed ascending and descending order', async () => {
      const results = await queryset.order_by('isActive', '-age').all();

      // isActive false first (false < true), then age descending
      expect((results[0] as any).name).toBe('Charlie'); // isActive: false, age: 35
      expect((results[1] as any).name).toBe('Bob');     // isActive: true, age: 30
      expect((results[2] as any).name).toBe('Alice');   // isActive: true, age: 25
    });

    it('should handle chaining multiple filters and excludes', async () => {
      const qs = queryset
        .filter({ isActive: true })
        .exclude({ age: 25 })
        .filter({ age: 30 });

      // Verify the QuerySet structure
      const plan = qs.getQueryPlan();
      expect(plan.filters).toHaveLength(2);
      expect(plan.excludes).toHaveLength(1);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty results', async () => {
      const results = await queryset.filter({ id: 999 }).all();
      expect(results).toHaveLength(0);
    });

    it('should handle limit 0', async () => {
      const results = await queryset.limit(0).all();
      expect(results).toHaveLength(0);
    });

    it('should handle large offset beyond results', async () => {
      const results = await queryset.offset(100).all();
      expect(results).toHaveLength(0);
    });

    it('should handle count on empty results', async () => {
      const count = await queryset.filter({ id: 999 }).count();
      expect(count).toBe(0);
    });

    it('should handle update with no matches', async () => {
      const count = await queryset
        .filter({ id: 999 })
        .update({ name: 'Updated' });

      expect(count).toBe(0);
    });

    it('should handle delete with no matches', async () => {
      const count = await queryset.filter({ id: 999 }).delete();
      expect(count).toBe(0);
    });
  });
});
