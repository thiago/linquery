# Linquery Examples

This directory contains practical examples demonstrating Linquery's features.

## Examples

### 01-basic-usage.ts
Demonstrates core ORM features:
- Model definition and initialization
- CRUD operations (Create, Read, Update, Delete)
- QuerySet filtering with lookups (`__gte`, `__lte`, etc.)
- Ordering and limiting results
- Counting and checking existence

**Run:**
```bash
npx tsx examples/01-basic-usage.ts
```

### 02-offline-sync.ts
Demonstrates offline-first synchronization:
- SyncAdapter setup with local and remote adapters
- Working offline with queued operations
- Push/pull synchronization
- Bidirectional sync
- Operation queue management
- Signal handling for sync events

**Run:**
```bash
npx tsx examples/02-offline-sync.ts
```

## Prerequisites

To run these examples, you'll need:

```bash
npm install
npm install -D tsx  # TypeScript execution
```

## Creating Your Own Examples

Feel free to create your own examples following this structure:

```typescript
import { Model, Manager, CharField } from '../src/core';
import { MemoryAdapter } from '../src/adapters';

// 1. Create adapter
const adapter = new MemoryAdapter();

// 2. Define model
class YourModel extends Model {
  declare id?: number;
  declare name: string;
  static objects: Manager<YourModel>;
}

// 3. Initialize model
YourModel.init({
  name: new CharField({ maxLength: 100 }),
});

// 4. Set adapter
(YourModel as any).setAdapter(adapter);
YourModel.objects = new Manager(YourModel, adapter);

// 5. Use it!
async function main() {
  await adapter.connect();
  const record = await YourModel.objects.create({ name: 'Test' });
  console.log(record);
  await adapter.disconnect();
}

main().catch(console.error);
```

## More Information

See the main [README.md](../README.md) for complete documentation and API reference.
