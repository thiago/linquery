/**
 * DexieAdapter Contract Tests
 *
 * Validates that DexieAdapter implements the BackendAdapter contract correctly.
 */

import Dexie from 'dexie';
import { runAdapterContract } from './adapterContract';
import { DexieAdapter } from '../../src/adapters/DexieAdapter';

runAdapterContract({
  name: 'DexieAdapter',
  createAdapter: async () => {
    // Create unique DB for each test using timestamp + random
    const dbName = `contract-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const db = new Dexie(dbName);
    db.version(1).stores({
      test_posts: '++id, title, content, published, views, createdAt',
      test_users: '++id, name, email, active',
    });

    const adapter = new DexieAdapter(db);
    return adapter;
  },
});
