/**
 * Integration tests for Model, Manager, QuerySet with MemoryAdapter
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Model, CharField, IntegerField, BooleanField, Manager } from '../../src/core';
import { MemoryAdapter } from '../../src/adapters';

// Define a test model
class User extends Model {
  // Instance properties
  declare id?: number;
  declare name: string;
  declare email: string;
  declare age: number;
  declare isActive: boolean;

  // Static manager
  static objects: Manager<User>;
}

// Initialize the User model
// Note: 'id' field is added automatically by Model.init() (Django-style AutoField)
User.init({
  name: new CharField({ maxLength: 100 }),
  email: new CharField({ maxLength: 255, unique: true }),
  age: new IntegerField({ min: 0, max: 150 }),
  isActive: new BooleanField({ default: true }),
});

describe('Model Integration Tests', () => {
  let adapter: MemoryAdapter;

  beforeEach(() => {
    // Create a fresh adapter for each test
    adapter = new MemoryAdapter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (User as any).setAdapter(adapter);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    User.objects = new Manager(User as any, adapter);
  });

  describe('Model Creation and Saving', () => {
    it('should create and save a model instance', async () => {
      const user = new User({
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
        isActive: true,
      });

      expect(user.isNew()).toBe(true);
      expect(user.id).toBeUndefined();

      await user.save();

      expect(user.isNew()).toBe(false);
      expect(user.id).toBe(1); // Auto-incremented
      expect(user.name).toBe('John Doe');
    });

    it('should apply default values', async () => {
      const user = new User({
        name: 'Jane Doe',
        email: 'jane@example.com',
        age: 25,
        // isActive not provided, should use default
      });

      await user.save();

      expect(user.isActive).toBe(true); // Default value applied
    });

    it('should validate required fields', async () => {
      const user = new User({
        // name is required but not provided
        email: 'invalid@example.com',
        age: 20,
      });

      await expect(user.save()).rejects.toThrow('Validation failed');
    });

    it('should validate field constraints', async () => {
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        age: 200, // Exceeds max: 150
      });

      await expect(user.save()).rejects.toThrow('Validation failed');
    });
  });

  describe('Manager.objects Queries', () => {
    beforeEach(async () => {
      // Create test data
      await User.objects.create({
        name: 'Alice',
        email: 'alice@example.com',
        age: 25,
        isActive: true,
      });

      await User.objects.create({
        name: 'Bob',
        email: 'bob@example.com',
        age: 30,
        isActive: true,
      });

      await User.objects.create({
        name: 'Charlie',
        email: 'charlie@example.com',
        age: 35,
        isActive: false,
      });
    });

    it('should get all records', async () => {
      const users = await User.objects.all().toArray();
      expect(users).toHaveLength(3);
    });

    it('should filter records', async () => {
      const activeUsers = await User.objects.filter({ isActive: true }).toArray();
      expect(activeUsers).toHaveLength(2);
      expect(activeUsers.every((u) => u.isActive)).toBe(true);
    });

    it('should get a single record', async () => {
      const user = await User.objects.get({ name: 'Alice' });
      expect(user.name).toBe('Alice');
      expect(user.email).toBe('alice@example.com');
      expect(user.age).toBe(25);
    });

    it('should throw DoesNotExist when record not found', async () => {
      await expect(User.objects.get({ name: 'NonExistent' })).rejects.toThrow(
        'User matching query does not exist'
      );
    });

    it('should throw MultipleObjectsReturned when multiple records match', async () => {
      await expect(User.objects.get({ isActive: true })).rejects.toThrow(
        'returned 2 User objects'
      );
    });

    it('should count records', async () => {
      const count = await User.objects.count();
      expect(count).toBe(3);

      const activeCount = await User.objects.filter({ isActive: true }).count();
      expect(activeCount).toBe(2);
    });

    it('should check if records exist', async () => {
      const exists = await User.objects.filter({ name: 'Alice' }).exists();
      expect(exists).toBe(true);

      const notExists = await User.objects.filter({ name: 'NonExistent' }).exists();
      expect(notExists).toBe(false);
    });

    it('should get first record', async () => {
      const user = await User.objects.first();
      expect(user).toBeDefined();
      expect(user?.name).toBe('Alice'); // First created
    });

    it('should get last record', async () => {
      const user = await User.objects.last();
      expect(user).toBeDefined();
      expect(user?.name).toBe('Charlie'); // Last created
    });
  });

  describe('QuerySet Chaining', () => {
    beforeEach(async () => {
      // Create test data with different ages
      await User.objects.create({
        name: 'User1',
        email: 'user1@example.com',
        age: 20,
        isActive: true,
      });

      await User.objects.create({
        name: 'User2',
        email: 'user2@example.com',
        age: 25,
        isActive: true,
      });

      await User.objects.create({
        name: 'User3',
        email: 'user3@example.com',
        age: 30,
        isActive: false,
      });

      await User.objects.create({
        name: 'User4',
        email: 'user4@example.com',
        age: 35,
        isActive: true,
      });
    });

    it('should chain filter and limit', async () => {
      const users = await User.objects.filter({ isActive: true }).limit(2).toArray();
      expect(users).toHaveLength(2);
      expect(users.every((u) => u.isActive)).toBe(true);
    });

    it('should apply offset and limit', async () => {
      const users = await User.objects.all().offset(1).limit(2).toArray();
      expect(users).toHaveLength(2);
      expect(users[0]!.name).toBe('User2'); // Skip first one
    });

    it('should order results', async () => {
      const users = await User.objects.order_by('-age').toArray(); // Descending
      expect(users[0]!.age).toBe(35); // Oldest first
      expect(users[3]!.age).toBe(20); // Youngest last
    });
  });

  describe('Model Updates and Deletes', () => {
    it('should update a model instance', async () => {
      const user = await User.objects.create({
        name: 'Original Name',
        email: 'original@example.com',
        age: 25,
      });

      expect(user.name).toBe('Original Name');

      user.name = 'Updated Name';
      user.age = 26;
      await user.save();

      // Verify the update
      const updated = await User.objects.get({ id: user.id });
      expect(updated.name).toBe('Updated Name');
      expect(updated.age).toBe(26);
    });

    it('should delete a model instance', async () => {
      const user = await User.objects.create({
        name: 'To Delete',
        email: 'delete@example.com',
        age: 25,
      });

      const countBefore = await User.objects.count();
      expect(countBefore).toBe(1);

      await user.delete();

      const countAfter = await User.objects.count();
      expect(countAfter).toBe(0);
    });

    it('should bulk update records', async () => {
      await User.objects.create({
        name: 'User1',
        email: 'user1@example.com',
        age: 25,
        isActive: true,
      });

      await User.objects.create({
        name: 'User2',
        email: 'user2@example.com',
        age: 30,
        isActive: true,
      });

      // Update all active users
      await User.objects.filter({ isActive: true }).update({ isActive: false });

      const activeUsers = await User.objects.filter({ isActive: true }).toArray();
      expect(activeUsers).toHaveLength(0);

      const inactiveUsers = await User.objects.filter({ isActive: false }).toArray();
      expect(inactiveUsers).toHaveLength(2);
    });

    it('should bulk delete records', async () => {
      await User.objects.create({
        name: 'User1',
        email: 'user1@example.com',
        age: 25,
        isActive: true,
      });

      await User.objects.create({
        name: 'User2',
        email: 'user2@example.com',
        age: 30,
        isActive: false,
      });

      await User.objects.create({
        name: 'User3',
        email: 'user3@example.com',
        age: 35,
        isActive: false,
      });

      const deleted = await User.objects.filter({ isActive: false }).delete();
      expect(deleted).toBe(2);

      const remaining = await User.objects.count();
      expect(remaining).toBe(1);
    });
  });

  describe('getOrCreate and updateOrCreate', () => {
    it('should get existing record with getOrCreate', async () => {
      const created = await User.objects.create({
        name: 'Existing User',
        email: 'existing@example.com',
        age: 25,
      });

      const { instance, created: wasCreated } = await User.objects.getOrCreate(
        { email: 'existing@example.com' },
        { age: 30 }
      );

      expect(wasCreated).toBe(false);
      expect(instance.id).toBe(created.id);
      expect(instance.age).toBe(25); // Original value, not default
    });

    it('should create new record with getOrCreate', async () => {
      const { instance, created } = await User.objects.getOrCreate(
        { email: 'new@example.com' },
        { name: 'New User', age: 25 }
      );

      expect(created).toBe(true);
      expect(instance.name).toBe('New User');
      expect(instance.email).toBe('new@example.com');
    });

    it('should update existing record with updateOrCreate', async () => {
      await User.objects.create({
        name: 'Original',
        email: 'update@example.com',
        age: 25,
      });

      const { instance, created } = await User.objects.updateOrCreate(
        { email: 'update@example.com' },
        { name: 'Updated', age: 30 }
      );

      expect(created).toBe(false);
      expect(instance.name).toBe('Updated');
      expect(instance.age).toBe(30);
    });

    it('should create new record with updateOrCreate', async () => {
      const { instance, created } = await User.objects.updateOrCreate(
        { email: 'create@example.com' },
        { name: 'Created', age: 25 }
      );

      expect(created).toBe(true);
      expect(instance.name).toBe('Created');
      expect(instance.email).toBe('create@example.com');
    });
  });

  describe('Async Iteration', () => {
    beforeEach(async () => {
      await User.objects.create({
        name: 'User1',
        email: 'user1@example.com',
        age: 20,
      });

      await User.objects.create({
        name: 'User2',
        email: 'user2@example.com',
        age: 25,
      });

      await User.objects.create({
        name: 'User3',
        email: 'user3@example.com',
        age: 30,
      });
    });

    it('should support async iteration', async () => {
      const names: string[] = [];
      const queryset = User.objects.all();

      for await (const user of queryset) {
        names.push(user.name);
      }

      expect(names).toHaveLength(3);
      expect(names).toContain('User1');
      expect(names).toContain('User2');
      expect(names).toContain('User3');
    });
  });
});
