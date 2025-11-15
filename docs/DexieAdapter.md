# DexieAdapter - IndexedDB Storage

The `DexieAdapter` provides IndexedDB storage for your models using [Dexie.js](https://dexie.org/).

## Key Features

- ✅ **Peer Dependency**: Dexie is not bundled - you install it separately
- ✅ **User-Provided Instance**: You configure and pass a Dexie instance
- ✅ **Auto Schema Generation**: ⭐ NEW! Automatically generates Dexie schema from Models
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

### ⭐ Auto Schema (Recommended - Zero Duplication!)

**No more triple duplication!** Just define your Model fields once:

```typescript
import Dexie from 'dexie';
import { DexieAdapter } from 'linquery/adapters';
import { Model, CharField, IntegerField, BooleanField } from 'linquery';

// 1. Create Dexie instance (no schema needed!)
const db = new Dexie('myAppDatabase');

// 2. Create adapter with auto-schema enabled (default)
const adapter = new DexieAdapter(db, { autoSchema: true });

// 3. Define your models normally
class Post extends Model {
  static tableName = 'posts';

  declare id?: number;
  declare title: string;
  declare slug: string;
  declare published: boolean;
  declare views: number;
}

// 4. Mark indexed fields with { index: true }
Post.init({
  title: new CharField({ maxLength: 200 }),
  slug: new CharField({ maxLength: 200, unique: true, index: true }),  // Indexed!
  published: new BooleanField({ default: false, index: true }),        // Indexed!
  views: new IntegerField({ default: 0 }),
});

// 5. Set adapter (auto-registers the model)
Post.setAdapter(adapter);

// 6. Connect (auto-generates schema: 'posts: ++id, slug, published')
await adapter.connect();

// Done! No manual Dexie schema needed
const post = await Post.objects.create({
  title: 'My First Post',
  slug: 'my-first-post',
  published: true
});
```

**What happened?**
- ✅ Model auto-registered when you called `Post.setAdapter(adapter)`
- ✅ Schema auto-generated from fields marked with `index: true` or `unique: true`
- ✅ Applied to Dexie when you called `await adapter.connect()`
- ✅ Zero duplication - you only defined fields in `Post.init()`!

### Manual Schema (If You Need Control)

You can still manually define the schema by setting `autoSchema: false`:

```typescript
const db = new Dexie('myAppDatabase');

// Manually define schema
db.version(1).stores({
  posts: '++id, title, published, views',
  users: '++id, name, email'
});

// Disable auto-schema
const adapter = new DexieAdapter(db, { autoSchema: false });

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

### Index Marking

**Only indexed fields are included in the Dexie schema.** Mark fields you want to query with `index: true`:

```typescript
Post.init({
  title: new CharField(),  // Not indexed - can't use in where() queries
  slug: new CharField({ index: true }),  // Indexed - can query efficiently
  views: new IntegerField({ index: true }),  // Indexed
});

// Generated schema: 'posts: ++id, slug, views'
```

**When to index:**
- ✅ Fields you filter/query by frequently (slug, email, status)
- ✅ Foreign keys
- ✅ Unique fields (automatically indexed)
- ❌ Large text fields (content, description)
- ❌ Fields you never query

### Table Names Must Match (Manual Schema Only)

With manual schema, your Model's `tableName` **must match** the table name in Dexie's schema:

```typescript
// ✅ Correct
db.version(1).stores({
  posts: '++id, title',
});

class Post extends Model {
  static tableName = 'posts';  // Same name
}

// ❌ Wrong
db.version(1).stores({
  post: '++id, title',
});

class Post extends Model {
  static tableName = 'posts';  // Different!
}
```

### Auto vs Manual Schema

| Aspect | Auto Schema | Manual Schema |
|--------|-------------|---------------|
| Duplication | ❌ None | ⚠️ Define twice |
| Flexibility | ✅ Simple | ✅ Full control |
| Version Control | Automatic | Manual |
| Use Case | Most apps | Advanced indexing |

### Why Peer Dependency?

- **Smaller bundle**: linquery doesn't include Dexie
- **Version control**: You choose which Dexie version to use
- **Flexibility**: You can upgrade Dexie independently
- **Optional**: Only install if you need IndexedDB

## Advanced Usage

### Multiple Models (Auto Schema)

```typescript
// One adapter for all models - schema auto-generated!
const db = new Dexie('myApp');
const adapter = new DexieAdapter(db);  // autoSchema: true by default

class Post extends Model {
  static tableName = 'posts';
}

Post.init({
  title: new CharField({ maxLength: 200 }),
  createdAt: new DateTimeField({ autoNowAdd: true, index: true }),
});
Post.setAdapter(adapter);

class Comment extends Model {
  static tableName = 'comments';
}

Comment.init({
  postId: new IntegerField({ index: true }),  // Foreign key
  content: new CharField({ maxLength: 1000 }),
  createdAt: new DateTimeField({ autoNowAdd: true, index: true }),
});
Comment.setAdapter(adapter);

class User extends Model {
  static tableName = 'users';
}

User.init({
  email: new CharField({ maxLength: 100, unique: true, index: true }),
  name: new CharField({ maxLength: 100 }),
});
User.setAdapter(adapter);

// Connect once - schema auto-generated for all 3 models!
await adapter.connect();

// Schema generated:
// {
//   posts: '++id, createdAt',
//   comments: '++id, postId, createdAt',
//   users: '++id, email'
// }
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
