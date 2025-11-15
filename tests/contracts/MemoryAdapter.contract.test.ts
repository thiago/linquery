/**
 * MemoryAdapter Contract Tests
 *
 * Validates that MemoryAdapter implements the BackendAdapter contract correctly.
 */

import { runAdapterContract } from './adapterContract';
import { MemoryAdapter } from '../../src/adapters/MemoryAdapter';

runAdapterContract({
  name: 'MemoryAdapter',
  createAdapter: () => new MemoryAdapter(),
});
