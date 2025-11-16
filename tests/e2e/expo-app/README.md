# Expo SQLite E2E Tests

This is a minimal Expo app for running end-to-end tests of the SQLiteAdapter with expo-sqlite.

## Setup

```bash
cd tests/e2e/expo-app
npm install
```

## Running Tests

### iOS Simulator

```bash
npm run ios
```

### Android Emulator

```bash
npm run android
```

### Expo Go (Physical Device)

```bash
npm start
# Scan QR code with Expo Go app
```

## What Gets Tested

The app runs 10 comprehensive tests:

1. Auto-schema generation
2. Create records
3. Get by ID
4. Find with filters
5. Update records
6. Delete records
7. Advanced queries (gt lookup)
8. Ordering (DESC)
9. Limit
10. Count

## Test Results

Results are displayed in the app UI:
- ✓ Green = Passed
- ✗ Red = Failed

Each test shows:
- Test name
- Pass/fail status
- Error message (if failed)

## How It Works

1. **App.tsx**: Main component that runs tests on mount
2. **tests/SQLiteAdapter.test.ts**: Test suite using expo-sqlite
3. Each test:
   - Creates a new database
   - Runs SQLiteAdapter operations
   - Validates results
   - Reports success/failure

## Requirements

- Node.js 20+
- iOS Simulator (macOS only) OR
- Android Emulator OR
- Physical device with Expo Go

## Notes

- Tests run automatically when app loads
- Each test uses a fresh database to avoid conflicts
- Database files are created in the app's documents directory
- Tests are self-contained and don't require network

## Troubleshooting

### "expo-sqlite not found"

Make sure you installed dependencies:
```bash
npm install
```

### Tests not running

Check the app console for errors:
```bash
npx expo start --clear
```

### iOS build fails

```bash
cd ios && pod install && cd ..
```

### Android build fails

```bash
cd android && ./gradlew clean && cd ..
```

## Adding More Tests

Edit `tests/SQLiteAdapter.test.ts` and add new test functions to the `runTests()` function:

```typescript
results.push(
  await runTest('your test name', async () => {
    // Your test code here
    // Throw error if test fails
  })
);
```
