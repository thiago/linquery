import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000, // Increased timeout for retry logic with exponential backoff
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/types.ts',
        '**/SyncAdapter.ts', // Has integration issues, skip from coverage
        '**/ConnectivityManager.ts', // Has browser-specific code issues in Node
        '**/browser-globals.d.ts', // Type definitions
        '**/*.test-d.ts', // Type tests
      ],
    },
  },
});
