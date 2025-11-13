/**
 * Integration tests for field lookups
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Model, CharField, IntegerField, DateTimeField, Manager } from '../../src/core';
import { MemoryAdapter } from '../../src/adapters';

// Define a test model
class TestModel extends Model {
  declare id?: number;
  declare name: string;
  declare age: number;
  declare email: string;
  declare created: Date;

  static objects: Manager<TestModel>;
}

TestModel.init({
  name: new CharField({ maxLength: 100 }),
  age: new IntegerField(),
  email: new CharField({ maxLength: 255 }),
  created: new DateTimeField(),
});

describe('Field Lookups', () => {
  let adapter: MemoryAdapter;

  beforeEach(async () => {
    adapter = new MemoryAdapter();

    // Type assertion needed: TypeScript cannot prove that `typeof TestModel` matches
    // `ModelClass<TestModel>` due to generic static methods and constructor signatures.
    // This is a known TypeScript limitation with class types, not a type safety bypass.
    // At runtime, TestModel IS a valid ModelClass<TestModel>.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (TestModel as any).setAdapter(adapter);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TestModel.objects = new Manager(TestModel as any, adapter);

    // Create test data
    await TestModel.objects.create({
      name: 'Alice',
      age: 25,
      email: 'alice@example.com',
      created: new Date('2024-01-15'),
    });

    await TestModel.objects.create({
      name: 'Bob',
      age: 30,
      email: 'bob@example.com',
      created: new Date('2024-02-20'),
    });

    await TestModel.objects.create({
      name: 'Charlie',
      age: 35,
      email: 'charlie@example.com',
      created: new Date('2024-03-10'),
    });

    await TestModel.objects.create({
      name: 'David',
      age: 20,
      email: 'DAVID@EXAMPLE.COM',
      created: new Date('2023-12-05'),
    });
  });

  describe('Comparison Lookups', () => {
    it('should filter with __gt (greater than)', async () => {
      const results = await TestModel.objects.filter({ age__gt: 25 }).toArray();
      expect(results).toHaveLength(2);
      expect(results.every(r => r.age > 25)).toBe(true);
    });

    it('should filter with __gte (greater than or equal)', async () => {
      const results = await TestModel.objects.filter({ age__gte: 25 }).toArray();
      expect(results).toHaveLength(3);
      expect(results.every(r => r.age >= 25)).toBe(true);
    });

    it('should filter with __lt (less than)', async () => {
      const results = await TestModel.objects.filter({ age__lt: 30 }).toArray();
      expect(results).toHaveLength(2);
      expect(results.every(r => r.age < 30)).toBe(true);
    });

    it('should filter with __lte (less than or equal)', async () => {
      const results = await TestModel.objects.filter({ age__lte: 30 }).toArray();
      expect(results).toHaveLength(3);
      expect(results.every(r => r.age <= 30)).toBe(true);
    });
  });

  describe('String Lookups', () => {
    it('should filter with __contains', async () => {
      const results = await TestModel.objects.filter({ name__contains: 'li' }).toArray();
      expect(results).toHaveLength(2); // Alice and Charlie
      expect(results.every(r => r.name.includes('li'))).toBe(true);
    });

    it('should filter with __icontains (case-insensitive)', async () => {
      const results = await TestModel.objects.filter({ name__icontains: 'LI' }).toArray();
      expect(results).toHaveLength(2); // Alice and Charlie
    });

    it('should filter with __startswith', async () => {
      const results = await TestModel.objects.filter({ name__startswith: 'A' }).toArray();
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });

    it('should filter with __istartswith (case-insensitive)', async () => {
      const results = await TestModel.objects.filter({ name__istartswith: 'a' }).toArray();
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });

    it('should filter with __endswith', async () => {
      const results = await TestModel.objects.filter({ name__endswith: 'e' }).toArray();
      expect(results).toHaveLength(2); // Alice and Charlie
    });

    it('should filter with __iendswith (case-insensitive)', async () => {
      const results = await TestModel.objects.filter({ name__iendswith: 'E' }).toArray();
      expect(results).toHaveLength(2); // Alice and Charlie
    });

    it('should filter with __exact', async () => {
      const results = await TestModel.objects.filter({ name__exact: 'Bob' }).toArray();
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Bob');
    });

    it('should filter with __iexact (case-insensitive)', async () => {
      const results = await TestModel.objects.filter({ name__iexact: 'bob' }).toArray();
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Bob');
    });
  });

  describe('List Lookups', () => {
    it('should filter with __in', async () => {
      const results = await TestModel.objects.filter({ age__in: [20, 30] }).toArray();
      expect(results).toHaveLength(2);
      expect(results.every(r => [20, 30].includes(r.age))).toBe(true);
    });

    it('should filter with __range', async () => {
      const results = await TestModel.objects.filter({ age__range: [25, 30] }).toArray();
      expect(results).toHaveLength(2); // Alice (25) and Bob (30)
      expect(results.every(r => r.age >= 25 && r.age <= 30)).toBe(true);
    });
  });

  describe('Null Lookups', () => {
    it('should filter with __isnull (true)', async () => {
      // Create a record with null email
      // Type assertion: See comment at line 33-36 for explanation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await adapter.create(TestModel as any, {
        id: 99,
        name: 'Null Test',
        age: 40,
        email: null,
        created: new Date(),
      });

      const results = await TestModel.objects.filter({ email__isnull: true }).toArray();
      expect(results).toHaveLength(1);
      expect(results[0]!.email).toBe(null);
    });

    it('should filter with __isnull (false)', async () => {
      const results = await TestModel.objects.filter({ email__isnull: false }).toArray();
      expect(results).toHaveLength(4); // All records with non-null email
      expect(results.every(r => r.email !== null)).toBe(true);
    });
  });

  describe('Date Lookups', () => {
    it('should filter with __year', async () => {
      const results = await TestModel.objects.filter({ created__year: 2024 }).toArray();
      expect(results).toHaveLength(3); // Alice, Bob, Charlie
    });

    it('should filter with __month', async () => {
      const results = await TestModel.objects.filter({ created__month: 1 }).toArray();
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });

    it('should filter with __day', async () => {
      const results = await TestModel.objects.filter({ created__day: 15 }).toArray();
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });
  });

  describe('Multiple Lookups', () => {
    it('should combine multiple lookups', async () => {
      const results = await TestModel.objects
        .filter({ age__gte: 25 })
        .filter({ name__startswith: 'A' })
        .toArray();

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });

    it('should combine different types of lookups', async () => {
      const results = await TestModel.objects
        .filter({ age__range: [20, 30] })
        .filter({ name__contains: 'o' })
        .toArray();

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Bob');
    });
  });

  describe('Backward Compatibility', () => {
    it('should work with simple filters (no lookup)', async () => {
      const results = await TestModel.objects.filter({ age: 25 }).toArray();
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });

    it('should default to exact match when no lookup specified', async () => {
      const results = await TestModel.objects.filter({ name: 'Bob' }).toArray();
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Bob');
    });
  });
});
