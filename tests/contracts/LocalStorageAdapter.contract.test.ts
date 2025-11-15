/**
 * LocalStorageAdapter Contract Tests
 *
 * Validates that LocalStorageAdapter implements the BackendAdapter contract correctly.
 */

import { runAdapterContract } from './adapterContract';
import { LocalStorageAdapter } from '../../src/adapters/LocalStorageAdapter';

// Mock localStorage for Node.js environment
class LocalStorageMock implements Storage {
  private store: Record<string, string> = {};

  get length(): number {
    return Object.keys(this.store).length;
  }

  clear(): void {
    this.store = {};
  }

  getItem(key: string): string | null {
    return this.store[key] || null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = value;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  key(index: number): string | null {
    const keys = Object.keys(this.store);
    return keys[index] || null;
  }
}

runAdapterContract({
  name: 'LocalStorageAdapter',
  createAdapter: () => {
    // Setup mock localStorage
    const localStorageMock = new LocalStorageMock();
    global.window = {
      localStorage: localStorageMock,
    } as any;

    return new LocalStorageAdapter({ prefix: 'test-contract' });
  },
  cleanup: () => {
    // Clean up global mock
    if ((global as any).window) {
      (global as any).window.localStorage.clear();
    }
  },
});
