/**
 * Offline-First Sync Example
 *
 * This example demonstrates Linquery's offline-first capabilities:
 * - SyncAdapter setup
 * - Working offline with local storage
 * - Push/pull synchronization
 * - Conflict resolution
 * - Operation queue management
 */

import {
  Model,
  Manager,
  CharField,
  IntegerField,
  BooleanField,
} from '../src/core';
import { MemoryAdapter } from '../src/adapters';
import { SyncAdapter } from '../src/sync/SyncAdapter';
import { signals } from '../src/core/Signal';

// For this example, we'll simulate local and remote with MemoryAdapters
const localAdapter = new MemoryAdapter();
const remoteAdapter = new MemoryAdapter();

// Create sync adapter
const syncAdapter = new SyncAdapter({
  local: localAdapter,
  remote: remoteAdapter,
  syncStrategy: 'last-write-wins',
  autoSync: false,  // Manual sync for this example
  retryAttempts: 3,
  retryDelay: 1000,
});

// Define model
class Todo extends Model {
  declare id?: number;
  declare title: string;
  declare description: string;
  declare completed: boolean;
  declare priority: number;

  static objects: Manager<Todo>;
}

Todo.init({
  title: new CharField({ maxLength: 200 }),
  description: new CharField({ maxLength: 1000 }),
  completed: new BooleanField({ default: false }),
  priority: new IntegerField({ default: 0 }),
});

(Todo as any).setAdapter(syncAdapter);
Todo.objects = new Manager<Todo>(Todo as any, syncAdapter);

// Register model for sync
syncAdapter.registerModel(Todo as any);

// Setup signal handlers
signals.preSync.connect(async (_sender, _instance, data) => {
  console.log(`[Signal] Pre-sync: ${data?.direction || 'unknown'}`);
});

signals.postSync.connect(async (_sender, _instance, data) => {
  const result = data?.result as any;
  console.log(
    `[Signal] Post-sync: ${result?.pushed || 0} pushed, ${result?.pulled || 0} pulled`
  );
});

signals.syncConflict.connect(async (_sender, _instance, data) => {
  console.log(`[Signal] Conflict detected: ${JSON.stringify(data)}`);
});

async function main() {
  console.log('=== Linquery Offline-First Sync Example ===\n');

  // Connect adapters
  await syncAdapter.connect();

  // Step 1: Create todos offline
  console.log('1. Creating todos (works offline):');
  const todo1 = await Todo.objects.create({
    title: 'Learn Linquery',
    description: 'Study the offline-first ORM',
    completed: false,
    priority: 1,
  });

  const todo2 = await Todo.objects.create({
    title: 'Build offline app',
    description: 'Create an app that works without internet',
    completed: false,
    priority: 2,
  });

  const todo3 = await Todo.objects.create({
    title: 'Write tests',
    description: 'Add comprehensive test coverage',
    completed: false,
    priority: 3,
  });

  console.log(`Created ${(todo1 as any).id} - ${todo1.title}`);
  console.log(`Created ${(todo2 as any).id} - ${todo2.title}`);
  console.log(`Created ${(todo3 as any).id} - ${todo3.title}\n`);

  // Step 2: Check queue status
  console.log('2. Queue status:');
  let stats = syncAdapter.getQueueStats();
  console.log(`Pending operations: ${stats.pending}`);
  console.log(`Synced operations: ${stats.synced}`);
  console.log(`Failed operations: ${stats.failed}\n`);

  // Step 3: View pending operations
  console.log('3. Pending operations:');
  const pending = syncAdapter.getPendingOperations();
  pending.forEach(op => {
    console.log(`- ${op.type} on ${op.modelName} (local ID: ${op.localId})`);
  });
  console.log();

  // Step 4: Push changes to remote
  console.log('4. Pushing changes to remote...');
  const pushResult = await syncAdapter.push();
  console.log(`Push result:`);
  console.log(`- Success: ${pushResult.success}`);
  console.log(`- Pushed: ${pushResult.pushed}`);
  console.log(`- Failed: ${pushResult.failed}\n`);

  // Step 5: Check queue after push
  console.log('5. Queue status after push:');
  stats = syncAdapter.getQueueStats();
  console.log(`Pending: ${stats.pending}`);
  console.log(`Synced: ${stats.synced}`);
  console.log(`Failed: ${stats.failed}\n`);

  // Step 6: Create a todo directly in remote (simulating other user)
  console.log('6. Simulating remote changes (other user):');
  await remoteAdapter.create(Todo as any, {
    id: 100,
    title: 'Review PRs',
    description: 'Review open pull requests',
    completed: false,
    priority: 2,
  });
  console.log('Remote todo created: Review PRs\n');

  // Step 7: Pull remote changes
  console.log('7. Pulling remote changes...');
  const pullResult = await syncAdapter.pull();
  console.log(`Pull result:`);
  console.log(`- Success: ${pullResult.success}`);
  console.log(`- Pulled: ${pullResult.pulled}`);
  console.log(`- Conflicts: ${pullResult.conflicts || 0}\n`);

  // Step 8: Verify local has remote todo
  console.log('8. All local todos after pull:');
  const allTodos = await Todo.objects.all().toArray();
  allTodos.forEach(todo => {
    console.log(`- [${(todo as any).id}] ${todo.title}`);
  });
  console.log();

  // Step 9: Bidirectional sync
  console.log('9. Running bidirectional sync (pull + push):');
  const syncResult = await syncAdapter.sync();
  console.log(`Sync result:`);
  console.log(`- Success: ${syncResult.success}`);
  console.log(`- Pulled: ${syncResult.pulled}`);
  console.log(`- Pushed: ${syncResult.pushed}\n`);

  // Step 10: Check online/offline status
  console.log('10. Connection status:');
  console.log(`Online: ${syncAdapter.isOnline()}`);
  console.log(`Offline: ${syncAdapter.isOffline()}\n`);

  // Step 11: Simulate failed operation
  console.log('11. Checking failed operations:');
  const failedOps = syncAdapter.getFailedOperations();
  console.log(`Failed operations: ${failedOps.length}\n`);

  // Step 12: Clear synced operations
  console.log('12. Clearing synced operations:');
  syncAdapter.clearSynced();
  stats = syncAdapter.getQueueStats();
  console.log(`Total operations after clear: ${stats.total}\n`);

  // Final stats
  console.log('=== Final Statistics ===');
  const finalStats = syncAdapter.getQueueStats();
  console.log(`Total operations: ${finalStats.total}`);
  console.log(`Pending: ${finalStats.pending}`);
  console.log(`Syncing: ${finalStats.syncing}`);
  console.log(`Synced: ${finalStats.synced}`);
  console.log(`Failed: ${finalStats.failed}`);

  const finalCount = await Todo.objects.count();
  console.log(`\nTotal todos: ${finalCount}`);

  await syncAdapter.disconnect();
}

// Run example
main().catch(console.error);
