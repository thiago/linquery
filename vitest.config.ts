import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup/indexeddb.ts'],
    testTimeout: 15000, // Increased timeout for retry logic with exponential backoff
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      '**/tests/integration/DexieAdapter.test.ts', // Requires real browser IndexedDB
      '**/tests/contracts/DexieAdapter.contract.test.ts', // Requires real browser IndexedDB
    ],
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
        '**/DexieAdapter.ts', // Requires browser IndexedDB, skip from coverage
        '**/browser-globals.d.ts', // Type definitions
        '**/*.test-d.ts', // Type tests
      ],
    },
  },
});
