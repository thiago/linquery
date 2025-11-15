/**
 * DexieAdapter Auto-Schema Tests
 *
 * Tests the automatic schema generation feature
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { DexieAdapter } from '../../src/adapters/DexieAdapter';
import { Model } from '../../src/core/Model';
import { CharField, IntegerField, BooleanField } from '../../src/core/Field';

describe('DexieAdapter - Auto Schema', () => {
  it('should auto-generate schema from Models', async () => {
    const db = new Dexie('auto-schema-test');
    const adapter = new DexieAdapter(db, { autoSchema: true });

    // Define models with indexed fields
    class Post extends Model {
      static tableName = 'posts';

      declare id?: number;
      declare title: string;
      declare slug: string;
      declare published: boolean;
      declare views: number;
    }

    Post.init({
      title: new CharField({ maxLength: 200 }),
      slug: new CharField({ maxLength: 200, unique: true, index: true }),
      published: new BooleanField({ default: false, index: true }),
      views: new IntegerField({ default: 0 }),
    });

    class User extends Model {
      static tableName = 'users';

      declare id?: number;
      declare email: string;
      declare name: string;
    }

    User.init({
      email: new CharField({ maxLength: 100, unique: true, index: true }),
      name: new CharField({ maxLength: 100 }),
    });

    // Set adapter - this will auto-register the models
    Post.setAdapter(adapter);
    User.setAdapter(adapter);

    // Connect - this will auto-generate and apply schema
    await adapter.connect();

    // Verify we can create records
    const post = await adapter.create(Post, {
      title: 'Test Post',
      slug: 'test-post',
      published: true,
      views: 100,
    });

    const user = await adapter.create(User, {
      email: 'test@example.com',
      name: 'Test User',
    });

    expect(post).toBeDefined();
    expect((post as any).id).toBe(1);
    expect(user).toBeDefined();
    expect((user as any).id).toBe(1);

    // Cleanup
    await adapter.disconnect();
    await db.delete();
  });

  it('should work without any indexed fields', async () => {
    const db = new Dexie('no-index-test');
    const adapter = new DexieAdapter(db);

    class SimpleModel extends Model {
      static tableName = 'simple';

      declare id?: number;
      declare name: string;
    }

    SimpleModel.init({
      name: new CharField({ maxLength: 100 }),
    });

    SimpleModel.setAdapter(adapter);
    await adapter.connect();

    const record = await adapter.create(SimpleModel, { name: 'Test' });
    expect(record).toBeDefined();
    expect((record as any).id).toBe(1);

    await adapter.disconnect();
    await db.delete();
  });

  it('should allow manual schema override by setting autoSchema: false', async () => {
    const db = new Dexie('manual-schema-test');

    // Manually define schema (note: tableName must match)
    db.version(1).stores({
      post: '++id, title, customField',
    });

    const adapter = new DexieAdapter(db, { autoSchema: false });

    class Post extends Model {
      static tableName = 'post';

      declare id?: number;
      declare title: string;
    }

    Post.init({
      title: new CharField({ maxLength: 200 }),
    });

    Post.setAdapter(adapter);
    await adapter.connect();

    const post = await adapter.create(Post, { title: 'Manual Schema Post' });
    expect(post).toBeDefined();

    await adapter.disconnect();
    await db.delete();
  });
});
