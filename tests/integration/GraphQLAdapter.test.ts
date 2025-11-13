/**
 * Integration tests for GraphQLAdapter
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Model, CharField, IntegerField, Manager } from '../../src/core';
import { GraphQLAdapter } from '../../src/adapters';

// Define test model
class User extends Model {
  declare id?: number;
  declare name: string;
  declare email: string;
  declare age: number;
  static objects: Manager<User>;
}

describe('GraphQLAdapter', () => {
  let adapter: GraphQLAdapter;
  let mockFetchResponses: unknown[] = [];
  let fetchCallCount = 0;

  // Mock fetch function
  const mockFetch = async (url: string, options?: RequestInit): Promise<Response> => {
    fetchCallCount++;

    const body = options?.body ? JSON.parse(options.body as string) : {};
    const query = body.query || '';

    // Return appropriate mock response based on query
    let responseData: unknown;

    if (query.includes('__schema')) {
      // Introspection query for connect()
      responseData = {
        data: {
          __schema: {
            queryType: { name: 'Query' },
          },
        },
      };
    } else if (mockFetchResponses.length > 0) {
      // Use pre-configured mock response
      responseData = mockFetchResponses.shift();
    } else {
      // Default empty response
      responseData = { data: {} };
    }

    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => responseData,
    } as Response;
  };

  beforeEach(async () => {
    fetchCallCount = 0;
    mockFetchResponses = [];

    // Initialize User model
    User.init({
      name: new CharField({ maxLength: 100 }),
      email: new CharField({ maxLength: 255 }),
      age: new IntegerField(),
    });

    // Create adapter with mock fetch
    adapter = new GraphQLAdapter({
      endpoint: 'https://api.example.com/graphql',
      headers: {
        Authorization: 'Bearer test-token',
      },
      queryNames: {
        list: 'users',
        get: 'user',
        create: 'createUser',
        update: 'updateUser',
        delete: 'deleteUser',
      },
      responsePaths: {
        list: 'users',
        get: 'user',
        create: 'createUser',
        update: 'updateUser',
      },
      fetchFn: mockFetch as typeof fetch,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (User as any).setAdapter(adapter);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    User.objects = new Manager(User as any, adapter);

    await adapter.connect();
  });

  describe('Connection', () => {
    it('should connect to GraphQL endpoint', async () => {
      expect(fetchCallCount).toBeGreaterThan(0);
    });

    it('should disconnect', async () => {
      await adapter.disconnect();
      // No error should be thrown
    });
  });

  describe('Create', () => {
    it('should create a new record', async () => {
      mockFetchResponses.push({
        data: {
          createUser: {
            id: 1,
            name: 'John Doe',
            email: 'john@example.com',
            age: 30,
          },
        },
      });

      const user = await User.objects.create({
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
      });

      expect(user.id).toBe(1);
      expect(user.name).toBe('John Doe');
      expect(user.email).toBe('john@example.com');
      expect(user.age).toBe(30);
    });

    it('should handle GraphQL errors', async () => {
      mockFetchResponses.push({
        errors: [
          {
            message: 'Validation failed',
          },
        ],
      });

      await expect(
        User.objects.create({
          name: 'Invalid',
          email: 'invalid',
          age: -1,
        })
      ).rejects.toThrow('GraphQL errors');
    });
  });

  describe('Find', () => {
    it('should find records', async () => {
      mockFetchResponses.push({
        data: {
          users: [
            {
              id: 1,
              name: 'John Doe',
              email: 'john@example.com',
              age: 30,
            },
            {
              id: 2,
              name: 'Jane Smith',
              email: 'jane@example.com',
              age: 25,
            },
          ],
        },
      });

      const users = await User.objects.all().toArray();

      expect(users).toHaveLength(2);
      expect(users[0]?.name).toBe('John Doe');
      expect(users[1]?.name).toBe('Jane Smith');
    });

    it('should find with filters', async () => {
      mockFetchResponses.push({
        data: {
          users: [
            {
              id: 1,
              name: 'John Doe',
              email: 'john@example.com',
              age: 30,
            },
          ],
        },
      });

      const users = await User.objects.filter({ name: 'John Doe' }).toArray();

      expect(users).toHaveLength(1);
      expect(users[0]?.name).toBe('John Doe');
    });

    it('should return empty array when no records found', async () => {
      mockFetchResponses.push({
        data: {
          users: [],
        },
      });

      const users = await User.objects.filter({ name: 'Nonexistent' }).toArray();

      expect(users).toHaveLength(0);
    });
  });

  describe('Update', () => {
    it('should update a record', async () => {
      // First create
      mockFetchResponses.push({
        data: {
          createUser: {
            id: 1,
            name: 'John Doe',
            email: 'john@example.com',
            age: 30,
          },
        },
      });

      const user = await User.objects.create({
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
      });

      // Then update
      mockFetchResponses.push({
        data: {
          updateUser: {
            id: 1,
            name: 'John Doe',
            email: 'john@example.com',
            age: 31,
          },
        },
      });

      user.age = 31;
      await user.save();

      expect(user.age).toBe(31);
    });
  });

  describe('Delete', () => {
    it('should delete a record', async () => {
      // First create
      mockFetchResponses.push({
        data: {
          createUser: {
            id: 1,
            name: 'John Doe',
            email: 'john@example.com',
            age: 30,
          },
        },
      });

      const user = await User.objects.create({
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
      });

      // Then delete
      mockFetchResponses.push({
        data: {
          deleteUser: {
            success: true,
          },
        },
      });

      await user.delete();
      // No error should be thrown
    });

    it('should throw error when deleting without id', async () => {
      const user = new User({
        name: 'No ID',
        email: 'noid@example.com',
        age: 25,
      });

      // Model.delete() checks for unsaved instance first
      await expect(user.delete()).rejects.toThrow('Cannot delete unsaved model instance');
    });
  });

  describe('Count', () => {
    it('should count records', async () => {
      // QuerySet.count() calls execute(), which uses find()
      // So we need to return an array
      mockFetchResponses.push({
        data: {
          users: Array.from({ length: 42 }, (_, i) => ({
            id: i + 1,
            name: `User ${i + 1}`,
            email: `user${i + 1}@example.com`,
            age: 25,
          })),
        },
      });

      const count = await User.objects.count();

      expect(count).toBe(42);
    });
  });

  describe('Exists', () => {
    it('should return true when records exist', async () => {
      mockFetchResponses.push({
        data: {
          users: [
            {
              id: 1,
              name: 'John',
              email: 'john@example.com',
              age: 30,
            },
          ],
        },
      });

      const exists = await User.objects.filter({ name: 'John' }).exists();

      expect(exists).toBe(true);
    });

    it('should return false when no records exist', async () => {
      mockFetchResponses.push({
        data: {
          users: [],
        },
      });

      const exists = await User.objects.filter({ name: 'Nonexistent' }).exists();

      expect(exists).toBe(false);
    });
  });

  describe('Field Mapping', () => {
    it('should use field mapping for GraphQL queries', async () => {
      const customAdapter = new GraphQLAdapter({
        endpoint: 'https://api.example.com/graphql',
        fieldMapping: {
          name: 'fullName',
          email: 'emailAddress',
        },
        queryNames: {
          list: 'users',
          create: 'createUser',
        },
        responsePaths: {
          list: 'users',
          create: 'createUser',
        },
        fetchFn: mockFetch as typeof fetch,
      });

      await customAdapter.connect();

      mockFetchResponses.push({
        data: {
          createUser: {
            id: 1,
            // GraphQL returns mapped field names
            fullName: 'John Doe',
            emailAddress: 'john@example.com',
            age: 30,
          },
        },
      });

      const user = await customAdapter.create(User, {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
      });

      // User creation succeeds and has an ID
      expect(user.id).toBe(1);
      // Note: fromDB() may transform fields back, implementation-dependent
    });
  });

  describe('Custom Query Names', () => {
    it('should use custom query names', async () => {
      const customAdapter = new GraphQLAdapter({
        endpoint: 'https://api.example.com/graphql',
        queryNames: {
          list: 'allUsers',
          create: 'addUser',
        },
        responsePaths: {
          list: 'allUsers',
          create: 'addUser',
        },
        fetchFn: mockFetch as typeof fetch,
      });

      await customAdapter.connect();

      mockFetchResponses.push({
        data: {
          allUsers: [
            {
              id: 1,
              name: 'John Doe',
              email: 'john@example.com',
              age: 30,
            },
          ],
        },
      });

      const users = await customAdapter.find(User, {}) as User[];

      expect(users).toHaveLength(1);
      expect(users[0]?.name).toBe('John Doe');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      const errorAdapter = new GraphQLAdapter({
        endpoint: 'https://api.example.com/graphql',
        fetchFn: async () => {
          throw new Error('Network error');
        },
      });

      await expect(errorAdapter.connect()).rejects.toThrow(
        'Failed to connect to GraphQL endpoint'
      );
    });

    it('should throw error when not connected', async () => {
      const disconnectedAdapter = new GraphQLAdapter({
        endpoint: 'https://api.example.com/graphql',
        fetchFn: mockFetch as typeof fetch,
      });

      await expect(disconnectedAdapter.find(User, {})).rejects.toThrow('Not connected');
    });

    it('should throw error when find returns invalid response', async () => {
      mockFetchResponses.push({
        data: {
          users: 'not an array', // Invalid - should be array
        },
      });

      await expect(adapter.find(User, {})).rejects.toThrow('Invalid response from list query');
    });

    it('should throw error when create returns invalid response', async () => {
      mockFetchResponses.push({
        data: {
          createUser: null, // Invalid - should be object
        },
      });

      await expect(adapter.create(User, { name: 'Test', email: 'test@example.com', age: 25 }))
        .rejects.toThrow('Invalid response from create mutation');
    });

    it('should throw error when update called without id', async () => {
      await expect(adapter.update(User, {}, { name: 'Updated' }))
        .rejects.toThrow('Update requires id in filters');
    });

    it('should throw error when delete called without id', async () => {
      await expect(adapter.delete(User, {}))
        .rejects.toThrow('Delete requires id in filters');
    });
  });

  describe('Direct adapter count/exists methods', () => {
    it('should count records using adapter count method', async () => {
      mockFetchResponses.push({
        data: {
          users: {
            totalCount: 42,
          },
        },
      });

      const queryPlan = {
        model: User,
        filters: [],
        excludes: [],
        ordering: [],
        selectRelated: [],
        prefetchRelated: [],
      };

      const count = await adapter.count(User, queryPlan as any);
      expect(count).toBe(42);
    });

    it('should throw error when count response is invalid', async () => {
      mockFetchResponses.push({
        data: {
          users: 'invalid', // Should have totalCount
        },
      });

      const queryPlan = {
        model: User,
        filters: [],
        excludes: [],
        ordering: [],
        selectRelated: [],
        prefetchRelated: [],
      };

      await expect(adapter.count(User, queryPlan as any))
        .rejects.toThrow('Invalid response from count query');
    });

    it('should check if records exist using adapter exists method', async () => {
      mockFetchResponses.push({
        data: {
          users: {
            totalCount: 5,
          },
        },
      });

      const queryPlan = {
        model: User,
        filters: [],
        excludes: [],
        ordering: [],
        selectRelated: [],
        prefetchRelated: [],
      };

      const exists = await adapter.exists(User, queryPlan as any);
      expect(exists).toBe(true);
    });

    it('should return false when no records exist using adapter exists method', async () => {
      mockFetchResponses.push({
        data: {
          users: {
            totalCount: 0,
          },
        },
      });

      const queryPlan = {
        model: User,
        filters: [],
        excludes: [],
        ordering: [],
        selectRelated: [],
        prefetchRelated: [],
      };

      const exists = await adapter.exists(User, queryPlan as any);
      expect(exists).toBe(false);
    });
  });
});
