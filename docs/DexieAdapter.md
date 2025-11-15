# DexieAdapter - IndexedDB Storage

The `DexieAdapter` provides IndexedDB storage for your models using [Dexie.js](https://dexie.org/).

## Key Features

- ✅ **Peer Dependency**: Dexie is not bundled - you install it separately
- ✅ **User-Provided Instance**: You configure and pass a Dexie instance
- ✅ **Full CRUD**: All operations supported
- ✅ **Advanced Queries**: 18 lookup types, ordering, pagination
- ✅ **Async/Promise-based**: Modern async API
- ✅ **Large Storage**: Subject to browser quota (much larger than localStorage)
- ✅ **Indexing**: Leverages Dexie's powerful indexing

## Installation

```bash
# Install Dexie separately
npm install dexie

# linquery is already installed
```

## Usage

### Basic Setup

```typescript
import Dexie from 'dexie';
import { DexieAdapter } from 'linquery/adapters';
import { Model, CharField, IntegerField, BooleanField } from 'linquery';

// 1. Create and configure Dexie instance
const db = new Dexie('myAppDatabase');
db.version(1).stores({
  posts: '++id, title, published, views',  // Define schema
  users: '++id, name, email'
});

// 2. Create adapter with Dexie instance
const adapter = new DexieAdapter(db);

// 3. Use with your models
class Post extends Model {
  static tableName = 'posts';
  static adapter = adapter;

  declare id?: number;
  declare title: string;
  declare content: string;
  declare published: boolean;
  declare views: number;
}

Post.init({
  title: new CharField({ maxLength: 200 }),
  content: new CharField({ maxLength: 2000 }),
  published: new BooleanField({ default: false }),
  views: new IntegerField({ default: 0 }),
});

// 4. Use normally
const post = await Post.objects.create({
  title: 'My First Post',
  content: 'Hello IndexedDB!',
  published: true,
  views: 0
});

const published = await Post.objects.filter({ published: true });
```

## Important Notes

### Table Names Must Match

Your Model's `tableName` **must match** the table name in Dexie's schema:

```typescript
// ✅ Correct
db.version(1).stores({
  posts: '++id, title',  // Matches Model.tableName
});

class Post extends Model {
  static tableName = 'posts';  // Same name
}

// ❌ Wrong
db.version(1).stores({
  post: '++id, title',  // Doesn't match
});

class Post extends Model {
  static tableName = 'posts';  // Different!
}
```

### Schema Definition

You must define the schema in Dexie. linquery doesn't auto-create tables:

```typescript
db.version(1).stores({
  posts: '++id, title, published, views, createdAt',
  //     ^^^ auto-increment primary key
  //         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ indexed fields
});
```

### Why Peer Dependency?

- **Smaller bundle**: linquery doesn't include Dexie
- **Version control**: You choose which Dexie version to use
- **Flexibility**: You can upgrade Dexie independently
- **Optional**: Only install if you need IndexedDB

## Advanced Usage

### Multiple Adapters

```typescript
// One Dexie instance for multiple models
const db = new Dexie('myApp');
db.version(1).stores({
  posts: '++id, title, createdAt',
  comments: '++id, postId, content, createdAt',
  users: '++id, email, name'
});

const adapter = new DexieAdapter(db);

class Post extends Model {
  static adapter = adapter;
  static tableName = 'posts';
}

class Comment extends Model {
  static adapter = adapter;
  static tableName = 'comments';
}

class User extends Model {
  static adapter = adapter;
  static tableName = 'users';
}
```

### Clear on Connect

```typescript
const adapter = new DexieAdapter(db, {
  clearOnConnect: true  // ⚠️ Clears all data on connect
});
```

### Querying

All linquery query features work:

```typescript
// Lookups
const popular = await Post.objects.filter({ views__gt: 1000 });
const recent = await Post.objects.filter({
  title__icontains: 'javascript'
});

// Ordering
const latest = await Post.objects.orderBy('-createdAt').limit(10);

// Pagination
const page2 = await Post.objects.limit(20).offset(20);

// Count & Exists
const count = await Post.objects.filter({ published: true }).count();
const hasPublished = await Post.objects.filter({ published: true }).exists();
```

## Browser Compatibility

- ✅ Chrome/Edge: Full support
- ✅ Firefox: Full support
- ✅ Safari: Full support (iOS 10+)
- ❌ Node.js: Not supported (browser-only)

## Storage Limits

IndexedDB storage is subject to browser quotas:

- **Desktop**: Typically 50-100% of available disk space
- **Mobile**: More restricted, varies by browser
- **Quota API**: Use `navigator.storage.estimate()` to check

## Testing

Tests require a real browser environment with IndexedDB. The adapter is tested in:

- Integration tests (run in browser)
- Manual testing with real applications

Note: Unit tests with `fake-indexeddb` are skipped as they don't fully replicate Dexie's behavior.

## Comparison with LocalStorageAdapter

| Feature | DexieAdapter | LocalStorageAdapter |
|---------|--------------|---------------------|
| Storage | IndexedDB (~GB) | localStorage (~5-10MB) |
| API | Async | Sync |
| Indexing | Yes (via Dexie) | No |
| Speed | Fast for large data | Fast for small data |
| Setup | Requires schema | No setup |
| Dependency | Dexie (peer) | None |

## Resources

- [Dexie.js Documentation](https://dexie.org/)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Storage Quotas](https://web.dev/storage-for-the-web/)
