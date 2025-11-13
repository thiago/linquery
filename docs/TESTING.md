# Testing

Complete guide to testing applications built with ORM.js.

## Table of Contents

- [Overview](#overview)
- [Test Setup](#test-setup)
- [Using MemoryAdapter for Tests](#using-memoryadapter-for-tests)
- [Fixtures and Factories](#fixtures-and-factories)
- [Mocking Adapters](#mocking-adapters)
- [Unit Tests](#unit-tests)
- [Integration Tests](#integration-tests)
- [Testing Signals](#testing-signals)
- [Testing Sync](#testing-sync)
- [Performance Testing](#performance-testing)
- [Best Practices](#best-practices)

## Overview

Testing ORM.js applications is straightforward because:

1. **Swappable adapters**: Use MemoryAdapter in tests for speed
2. **No database required**: Tests run without external dependencies
3. **Isolated**: Each test can have its own adapter instance
4. **Deterministic**: In-memory data is predictable

## Test Setup

### Basic Setup (Vitest)

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
```

```typescript
// tests/setup.ts
import { beforeEach } from 'vitest';
import { Model } from 'orm-js';

// Reset all models before each test
beforeEach(() => {
  // Clear adapter data if needed
});
```

### Test File Structure

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Model, CharField, IntegerField, MemoryAdapter } from 'orm-js';

// Define models for testing
class User extends Model {
  static adapter = new MemoryAdapter();

  name = new CharField({ maxLength: 100 });
  email = new CharField({ maxLength: 255 });
  age = new IntegerField({ required: false });
}

describe('User Model', () => {
  beforeEach(async () => {
    // Clear data before each test
    User.adapter = new MemoryAdapter();
  });

  it('should create user', async () => {
    const user = await User.objects.create({
      name: 'John Doe',
      email: 'john@example.com',
    });

    expect(user.id).toBeDefined();
    expect(user.name).toBe('John Doe');
  });

  it('should validate required fields', async () => {
    await expect(
      User.objects.create({ age: 25 })
    ).rejects.toThrow('name is required');
  });
});
```

## Using MemoryAdapter for Tests

The MemoryAdapter is perfect for tests: fast, isolated, no external dependencies.

### Per-Test Isolation

```typescript
describe('User tests', () => {
  let adapter: MemoryAdapter;

  beforeEach(() => {
    // Fresh adapter for each test
    adapter = new MemoryAdapter();
    User.adapter = adapter;
    Post.adapter = adapter;
  });

  it('test 1', async () => {
    await User.objects.create({ name: 'Alice' });
    const count = await User.objects.count();
    expect(count).toBe(1);
  });

  it('test 2', async () => {
    // Starts fresh, previous test data is gone
    const count = await User.objects.count();
    expect(count).toBe(0);
  });
});
```

### Seeding Test Data

```typescript
beforeEach(async () => {
  adapter = new MemoryAdapter({
    // Pre-populate with test data
    initialData: {
      users: [
        { id: 1, name: 'Alice', email: 'alice@example.com' },
        { id: 2, name: 'Bob', email: 'bob@example.com' },
      ],
      posts: [
        { id: 1, title: 'Post 1', author_id: 1 },
        { id: 2, title: 'Post 2', author_id: 1 },
      ],
    },
  });

  User.adapter = adapter;
  Post.adapter = adapter;
});

it('should query pre-seeded data', async () => {
  const users = await User.objects.all();
  expect(users).toHaveLength(2);
});
```

## Fixtures and Factories

### Simple Factory Pattern

```typescript
// tests/factories.ts
import { User, Post } from '../models';

export const UserFactory = {
  build(overrides = {}) {
    return {
      name: 'John Doe',
      email: `user${Math.random()}@example.com`,
      age: 25,
      ...overrides,
    };
  },

  async create(overrides = {}) {
    return await User.objects.create(this.build(overrides));
  },

  async createMany(count: number, overrides = {}) {
    const users = [];
    for (let i = 0; i < count; i++) {
      users.push(await this.create(overrides));
    }
    return users;
  },
};

export const PostFactory = {
  async create(overrides = {}) {
    const user = overrides.author || await UserFactory.create();

    return await Post.objects.create({
      title: 'Test Post',
      content: 'Test content',
      author: user,
      ...overrides,
    });
  },
};
```

**Usage:**

```typescript
it('should create user with factory', async () => {
  const user = await UserFactory.create({ name: 'Alice' });
  expect(user.name).toBe('Alice');
});

it('should create multiple users', async () => {
  const users = await UserFactory.createMany(5);
  expect(users).toHaveLength(5);
});

it('should create post with author', async () => {
  const post = await PostFactory.create({ title: 'My Post' });
  const author = await post.author;
  expect(author).toBeDefined();
});
```

### Advanced Factory with Faker

```typescript
import { faker } from '@faker-js/faker';

export const UserFactory = {
  build(overrides = {}) {
    return {
      name: faker.person.fullName(),
      email: faker.internet.email(),
      age: faker.number.int({ min: 18, max: 80 }),
      ...overrides,
    };
  },

  async create(overrides = {}) {
    return await User.objects.create(this.build(overrides));
  },
};
```

### Fixture Files

```typescript
// tests/fixtures/users.json
[
  {
    "id": 1,
    "name": "Alice",
    "email": "alice@example.com",
    "age": 30
  },
  {
    "id": 2,
    "name": "Bob",
    "email": "bob@example.com",
    "age": 25
  }
]
```

```typescript
// tests/utils/loadFixtures.ts
import fs from 'fs';
import path from 'path';

export async function loadFixtures(model: typeof Model, filename: string) {
  const data = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../fixtures', filename), 'utf-8')
  );

  for (const item of data) {
    await model.objects.create(item);
  }
}

// Usage
beforeEach(async () => {
  await loadFixtures(User, 'users.json');
  await loadFixtures(Post, 'posts.json');
});
```

## Mocking Adapters

### Mock Adapter for Testing Edge Cases

```typescript
class MockAdapter implements BackendAdapter {
  // Track calls
  createCalls: any[] = [];
  filterCalls: any[] = [];

  // Control behavior
  shouldFail = false;
  delayMs = 0;

  async create<T>(model: ModelClass<T>, data: Partial<T>): Promise<T> {
    this.createCalls.push({ model, data });

    if (this.shouldFail) {
      throw new Error('Create failed');
    }

    await this.delay();

    return { id: 1, ...data } as T;
  }

  async filter<T>(model: ModelClass<T>, query: QueryPlan): Promise<T[]> {
    this.filterCalls.push({ model, query });

    if (this.shouldFail) {
      throw new Error('Filter failed');
    }

    await this.delay();

    return [];
  }

  private delay() {
    return new Promise(resolve => setTimeout(resolve, this.delayMs));
  }

  // ... implement other methods
}
```

**Usage:**

```typescript
it('should handle adapter failures', async () => {
  const mockAdapter = new MockAdapter();
  mockAdapter.shouldFail = true;
  User.adapter = mockAdapter;

  await expect(
    User.objects.create({ name: 'Test' })
  ).rejects.toThrow('Create failed');
});

it('should track adapter calls', async () => {
  const mockAdapter = new MockAdapter();
  User.adapter = mockAdapter;

  await User.objects.create({ name: 'Test' });

  expect(mockAdapter.createCalls).toHaveLength(1);
  expect(mockAdapter.createCalls[0].data.name).toBe('Test');
});
```

### Spy on Adapter Methods

```typescript
import { vi } from 'vitest';

it('should call adapter.create', async () => {
  const adapter = new MemoryAdapter();
  const createSpy = vi.spyOn(adapter, 'create');

  User.adapter = adapter;
  await User.objects.create({ name: 'Test' });

  expect(createSpy).toHaveBeenCalledOnce();
  expect(createSpy).toHaveBeenCalledWith(
    User,
    expect.objectContaining({ name: 'Test' })
  );
});
```

## Unit Tests

### Testing Models

```typescript
describe('User Model', () => {
  it('should create instance', () => {
    const user = new User({ name: 'John', email: 'john@example.com' });
    expect(user.name).toBe('John');
  });

  it('should validate on save', async () => {
    const user = new User({ name: 'A' }); // Missing required email
    await expect(user.save()).rejects.toThrow(ValidationError);
  });

  it('should call clean method', async () => {
    const user = new User({ name: 'John', email: 'invalid' });
    user.clean = vi.fn();

    await user.save();
    expect(user.clean).toHaveBeenCalled();
  });
});
```

### Testing QuerySets

```typescript
describe('QuerySet', () => {
  beforeEach(async () => {
    await UserFactory.createMany(10);
  });

  it('should filter', async () => {
    const users = await User.objects.filter({ age__gte: 30 }).all();
    expect(users.every(u => u.age >= 30)).toBe(true);
  });

  it('should chain methods', async () => {
    const users = await User.objects
      .filter({ age__gte: 20 })
      .exclude({ name: 'Test' })
      .order_by('-age')
      .limit(5)
      .all();

    expect(users).toHaveLength(5);
  });

  it('should be lazy', async () => {
    const qs = User.objects.filter({ age__gte: 30 });

    // No query yet
    const adapter = User.adapter as MemoryAdapter;
    const filterSpy = vi.spyOn(adapter, 'filter');

    expect(filterSpy).not.toHaveBeenCalled();

    // Query executes now
    await qs.all();
    expect(filterSpy).toHaveBeenCalledOnce();
  });
});
```

### Testing Relationships

```typescript
describe('Relationships', () => {
  it('should resolve ForeignKey', async () => {
    const user = await UserFactory.create();
    const post = await PostFactory.create({ author: user });

    const author = await post.author;
    expect(author.id).toBe(user.id);
  });

  it('should resolve reverse relation', async () => {
    const user = await UserFactory.create();
    await PostFactory.create({ author: user });
    await PostFactory.create({ author: user });

    const posts = await user.posts.all();
    expect(posts).toHaveLength(2);
  });

  it('should eager load with select_related', async () => {
    const user = await UserFactory.create();
    await PostFactory.create({ author: user });

    const post = await Post.objects
      .select_related('author')
      .first();

    // Author is already loaded
    expect(post.author).not.toBeInstanceOf(Promise);
    expect(post.author.id).toBe(user.id);
  });
});
```

## Integration Tests

### Testing with Real Adapter

```typescript
// Only run if TEST_DATABASE is set
const shouldRunIntegration = !!process.env.TEST_DATABASE;

describe.skipIf(!shouldRunIntegration)('Integration Tests', () => {
  let adapter: PostgresAdapter;

  beforeAll(async () => {
    adapter = new PostgresAdapter({
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
    });

    await adapter.connect();

    // Create tables
    await adapter.raw(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(255)
      )
    `);
  });

  afterAll(async () => {
    await adapter.raw('DROP TABLE users');
    await adapter.disconnect();
  });

  beforeEach(async () => {
    await adapter.raw('TRUNCATE users RESTART IDENTITY');
  });

  it('should create user in real database', async () => {
    User.adapter = adapter;

    const user = await User.objects.create({
      name: 'John',
      email: 'john@example.com',
    });

    expect(user.id).toBeDefined();

    // Verify in database
    const users = await User.objects.all();
    expect(users).toHaveLength(1);
  });
});
```

## Testing Signals

```typescript
import { signal, SignalType } from 'orm-js';

describe('Signals', () => {
  it('should emit POST_SAVE signal', async () => {
    const handler = vi.fn();

    signal(SignalType.POST_SAVE).connect(handler, { sender: User });

    await UserFactory.create();

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(
      User,
      expect.any(User),
      true // created
    );
  });

  it('should disconnect signal', async () => {
    const handler = vi.fn();
    signal(SignalType.POST_SAVE).connect(handler);

    await UserFactory.create();
    expect(handler).toHaveBeenCalledOnce();

    signal(SignalType.POST_SAVE).disconnect(handler);

    await UserFactory.create();
    expect(handler).toHaveBeenCalledOnce(); // Still only once
  });
});
```

## Testing Sync

```typescript
describe('SyncAdapter', () => {
  let localAdapter: MemoryAdapter;
  let remoteAdapter: MockAdapter;
  let syncAdapter: SyncAdapter;

  beforeEach(() => {
    localAdapter = new MemoryAdapter();
    remoteAdapter = new MockAdapter();
    syncAdapter = new SyncAdapter({
      local: localAdapter,
      remote: remoteAdapter,
    });

    User.adapter = syncAdapter;
  });

  it('should save locally immediately', async () => {
    remoteAdapter.delayMs = 1000; // Slow remote

    const user = await User.objects.create({ name: 'Test' });

    // Should have result immediately (from local)
    expect(user.id).toBeDefined();
  });

  it('should queue operation when offline', async () => {
    syncAdapter.setOnline(false);

    await User.objects.create({ name: 'Offline' });

    const queue = await syncAdapter.getQueue();
    expect(queue).toHaveLength(1);
  });

  it('should sync when going online', async () => {
    syncAdapter.setOnline(false);
    await User.objects.create({ name: 'Test' });

    syncAdapter.setOnline(true);
    await syncAdapter.sync();

    expect(remoteAdapter.createCalls).toHaveLength(1);
  });
});
```

## Performance Testing

```typescript
describe('Performance', () => {
  it('should handle large dataset', async () => {
    const start = Date.now();

    // Create 10k users
    const users = [];
    for (let i = 0; i < 10000; i++) {
      users.push({ name: `User ${i}`, email: `user${i}@example.com` });
    }

    await User.objects.bulkCreate(users);

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000); // Should be under 1 second
  });

  it('should not have N+1 problem', async () => {
    const user = await UserFactory.create();
    await PostFactory.createMany(100, { author: user });

    const adapter = Post.adapter as MemoryAdapter;
    const filterSpy = vi.spyOn(adapter, 'filter');

    // Without select_related: N+1 queries
    const posts1 = await Post.objects.all();
    filterSpy.mockClear();

    for (const post of posts1) {
      await post.author;
    }
    expect(filterSpy.mock.calls.length).toBeGreaterThan(50); // Many queries

    // With select_related: 1 query
    filterSpy.mockClear();
    const posts2 = await Post.objects.select_related('author').all();
    expect(filterSpy).toHaveBeenCalledOnce(); // Single query
  });
});
```

## Best Practices

### 1. Use MemoryAdapter by Default

```typescript
// Good: Fast, isolated tests
describe('User tests', () => {
  beforeEach(() => {
    User.adapter = new MemoryAdapter();
  });
});

// Avoid: Slow, requires database
describe('User tests', () => {
  beforeEach(async () => {
    User.adapter = new PostgresAdapter({...});
    await User.adapter.connect();
  });
});
```

### 2. Isolate Each Test

```typescript
// Good: Fresh adapter per test
beforeEach(() => {
  User.adapter = new MemoryAdapter();
});

// Bad: Shared state between tests
before(() => {
  User.adapter = new MemoryAdapter(); // Only once!
});
```

### 3. Use Factories

```typescript
// Good: Reusable, flexible
const user = await UserFactory.create({ age: 30 });

// Bad: Duplicated data in each test
const user = await User.objects.create({
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
  // ... many fields
});
```

### 4. Test Behavior, Not Implementation

```typescript
// Good: Test what the user sees
it('should create user', async () => {
  const user = await User.objects.create({ name: 'Test' });
  expect(user.name).toBe('Test');
});

// Bad: Test internal implementation
it('should call adapter.create', async () => {
  const spy = vi.spyOn(User.adapter, 'create');
  await User.objects.create({ name: 'Test' });
  expect(spy).toHaveBeenCalled();
});
```

### 5. Use Descriptive Test Names

```typescript
// Good
it('should throw ValidationError when email is invalid', async () => {});
it('should return empty array when no users match filter', async () => {});

// Bad
it('test 1', async () => {});
it('works', async () => {});
```

### 6. Group Related Tests

```typescript
describe('User', () => {
  describe('creation', () => {
    it('should create with valid data', async () => {});
    it('should fail with invalid email', async () => {});
  });

  describe('querying', () => {
    it('should filter by age', async () => {});
    it('should order by name', async () => {});
  });
});
```

### 7. Clean Up After Tests

```typescript
afterEach(async () => {
  // Disconnect signals
  signal(SignalType.POST_SAVE).disconnectAll();

  // Clear caches if any
  // ...
});
```

## Example: Complete Test Suite

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { User, Post } from '../models';
import { UserFactory, PostFactory } from './factories';
import { MemoryAdapter } from 'orm-js';

describe('Blog App', () => {
  beforeEach(() => {
    User.adapter = new MemoryAdapter();
    Post.adapter = new MemoryAdapter();
  });

  describe('User', () => {
    it('should create user', async () => {
      const user = await UserFactory.create({ name: 'Alice' });
      expect(user.name).toBe('Alice');
    });

    it('should require email', async () => {
      await expect(
        User.objects.create({ name: 'Alice' })
      ).rejects.toThrow('email is required');
    });

    it('should have posts relationship', async () => {
      const user = await UserFactory.create();
      await PostFactory.create({ author: user });
      await PostFactory.create({ author: user });

      const posts = await user.posts.all();
      expect(posts).toHaveLength(2);
    });
  });

  describe('Post', () => {
    it('should create post with author', async () => {
      const post = await PostFactory.create({ title: 'Test Post' });

      expect(post.title).toBe('Test Post');
      expect(post.author_id).toBeDefined();
    });

    it('should eager load author', async () => {
      await PostFactory.create();

      const post = await Post.objects.select_related('author').first();

      expect(post.author).not.toBeInstanceOf(Promise);
      expect(post.author.name).toBeDefined();
    });
  });

  describe('Queries', () => {
    beforeEach(async () => {
      await UserFactory.createMany(5, { age: 25 });
      await UserFactory.createMany(5, { age: 35 });
    });

    it('should filter by age', async () => {
      const users = await User.objects.filter({ age: 25 }).all();
      expect(users).toHaveLength(5);
    });

    it('should chain filters', async () => {
      const users = await User.objects
        .filter({ age__gte: 30 })
        .order_by('-age')
        .limit(3)
        .all();

      expect(users).toHaveLength(3);
    });
  });
});
```
