/**
 * Tests for main exports
 */

import { describe, it, expect } from 'vitest';

describe('Package exports', () => {
  it('should export main entry point', async () => {
    const exports = await import('../../src/index');

    // Check VERSION export
    expect(exports.VERSION).toBeDefined();
    expect(typeof exports.VERSION).toBe('string');

    // Check core exports
    expect(exports.Model).toBeDefined();
    expect(exports.Field).toBeDefined();
    expect(exports.signals).toBeDefined();

    // Check adapter exports
    expect(exports.MemoryAdapter).toBeDefined();
    expect(exports.GraphQLAdapter).toBeDefined();

    // Check sync exports
    expect(exports.SyncAdapter).toBeDefined();
    expect(exports.SyncEngine).toBeDefined();
    expect(exports.OperationQueue).toBeDefined();
  });

  it('should export sync module', async () => {
    const exports = await import('../../src/sync/index');

    expect(exports.SyncAdapter).toBeDefined();
    expect(exports.SyncEngine).toBeDefined();
    expect(exports.OperationQueue).toBeDefined();
    expect(exports.ConnectivityManager).toBeDefined();
  });
});
