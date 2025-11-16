# E2E Tests for SQLiteAdapter

This directory contains end-to-end tests for the SQLiteAdapter across all platforms.

## Test Suites

### ✅ SQL.js (Browser) - `SQLiteAdapter-SqlJs.test.ts`

**Status:** ✅ Automated (runs in CI)
**Tests:** 21 tests
**Environment:** Node.js (SQL.js WASM works in Node)

```bash
npm test -- SQLiteAdapter-SqlJs.test.ts --run
```

**What's tested:**
- Auto-schema generation
- CRUD operations (create, read, update, delete)
- Field type conversions (boolean, date, integer)
- Advanced queries (18 lookup types)
- Ordering (ASC/DESC)
- Pagination (limit/offset)
- Count and exists
- Export/import database (SQL.js specific)
- Transactions with rollback

### 📱 expo-sqlite (React Native) - `expo-app/`

**Status:** ⚠️ Manual (requires device/emulator)
**Tests:** 10 tests
**Environment:** React Native (iOS/Android)

```bash
cd tests/e2e/expo-app
npm install
npm run ios    # or npm run android
```

**What's tested:**
- Auto-schema generation
- CRUD operations
- Find with filters
- Update and delete
- Advanced queries (gt lookup)
- Ordering
- Limit
- Count

**How it works:**
- Minimal Expo app that runs tests on startup
- Tests display in UI (green = pass, red = fail)
- Each test uses a fresh database
- Results shown with error messages

### ✅ better-sqlite3 (Node.js) - `integration/SQLiteAdapter.test.ts`

**Status:** ✅ Automated (runs in CI)
**Tests:** 27 tests
**Environment:** Node.js (native)

```bash
npm test -- SQLiteAdapter.test.ts --run
```

**What's tested:**
- Auto-schema generation
- CRUD operations
- Field type conversions
- Advanced queries (all 18 lookups)
- Ordering and pagination
- Constraints (UNIQUE, NOT NULL)
- Transactions with rollback

## Platform Coverage

| Platform | Engine | Tests | CI | Manual |
|----------|--------|-------|----|----|
| Node.js | better-sqlite3 | 27 | ✅ | ✅ |
| Browser | SQL.js | 21 | ✅ | ✅ |
| React Native | expo-sqlite | 10 | ❌ | ✅ |

**Total:** 58 E2E tests across 3 platforms

## Running All Tests

### Automated (CI-compatible)

```bash
# Node.js + Browser (48 tests)
npm test --run
```

This runs:
- better-sqlite3 tests (27)
- SQL.js tests (21)

### Manual (Expo)

```bash
# React Native (10 tests)
cd tests/e2e/expo-app
npm install
npm run ios  # or android
```

Watch the app for test results.

## Why This Setup?

### better-sqlite3 (Node.js)
- ✅ Fast (native)
- ✅ CI-friendly
- ✅ Complete test coverage

### SQL.js (Browser)
- ✅ Works in Node.js too (WASM)
- ✅ CI-friendly
- ✅ Tests browser-specific features (export/import)

### expo-sqlite (React Native)
- ⚠️ Requires real device/emulator
- ⚠️ Can't run in CI without complex setup
- ✅ Tests actual mobile environment
- ✅ Visual feedback in app

## Test Strategy

1. **Core functionality:** Tested in all 3 platforms
2. **Platform-specific features:**
   - SQL.js: export/import
   - better-sqlite3: WAL mode, native perf
   - expo-sqlite: mobile-specific APIs

3. **CI Pipeline:** Runs Node.js + Browser (48 tests)
4. **Pre-release:** Manual Expo testing (10 tests)

## Adding New Tests

### For better-sqlite3 or SQL.js

Add to respective test files:

```typescript
it('should do something', async () => {
  // Test code
});
```

### For Expo

Edit `expo-app/tests/SQLiteAdapter.test.ts`:

```typescript
results.push(
  await runTest('should do something', async () => {
    // Test code
    // Throw error if failed
  })
);
```

## Continuous Integration

GitHub Actions runs:
```yaml
- name: Run E2E Tests
  run: npm test --run
```

This executes:
- ✅ better-sqlite3 tests (Node.js)
- ✅ SQL.js tests (Browser WASM)
- ❌ expo-sqlite tests (requires device)

## Future Improvements

- [ ] Detox setup for automated Expo tests
- [ ] Maestro for cross-platform mobile testing
- [ ] Browser E2E with Playwright
- [ ] Performance benchmarks
- [ ] Load testing

## Troubleshooting

### SQL.js tests fail

```bash
# Reinstall SQL.js
npm install --save-dev sql.js
npm test -- SQLiteAdapter-SqlJs.test.ts --run
```

### Expo app won't start

```bash
cd tests/e2e/expo-app
rm -rf node_modules
npm install
npx expo start --clear
```

### Better-sqlite3 compilation errors

```bash
npm rebuild better-sqlite3
```

## Resources

- [better-sqlite3 docs](https://github.com/WiseLibs/better-sqlite3)
- [SQL.js docs](https://sql.js.org/)
- [Expo SQLite docs](https://docs.expo.dev/versions/latest/sdk/sqlite/)
