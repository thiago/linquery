# SQLiteAdapter - Universal SQLite Storage

The `SQLiteAdapter` provides SQLite database storage across all platforms: **Browser** (SQL.js WASM), **Node.js** (better-sqlite3), and **React Native/Expo** (expo-sqlite).

## Key Features

- ✅ **Universal**: Works on Browser, Node.js, React Native/Expo
- ✅ **Peer Dependency**: SQLite libraries not bundled - you install what you need
- ✅ **Auto Schema Generation**: ⭐ Automatically generates schema from Models
- ✅ **Full CRUD**: All operations supported
- ✅ **Advanced Queries**: 18 lookup types, ordering, pagination
- ✅ **Transactions**: Full ACID compliance
- ✅ **Type Safe**: Full TypeScript support
- ✅ **Migrations**: Schema versioning support

## Platform Comparison

| Feature | Node.js | Browser | React Native |
|---------|---------|---------|--------------|
| Library | better-sqlite3 | SQL.js (WASM) | expo-sqlite |
| Performance | ⚡⚡⚡ Native | ⚡⚡ WASM | ⚡⚡⚡ Native |
| Storage | Disk | Memory* | Disk |
| Threading | Sync | Sync | Sync |
| Size | ~1MB | ~500KB | ~2MB |

*SQL.js can persist to IndexedDB or localStorage

## Installation

Choose your platform and install the corresponding SQLite library:

### Node.js / Electron

```bash
npm install better-sqlite3
```

### Browser (WASM)

```bash
npm install sql.js
```

### React Native / Expo

```bash
npx expo install expo-sqlite
```

**linquery is already installed** - these are optional peer dependencies.

---

## Usage

### ⭐ Node.js (better-sqlite3)

**Recommended for:** Desktop apps, servers, CLI tools

```typescript
import Database from 'better-sqlite3';
import { SQLiteAdapter, BetterSQLite3Engine } from 'linquery/adapters';
import { Model, CharField, IntegerField } from 'linquery';

// 1. Create database (file or :memory:)
const db = new Database('myapp.db');

// 2. Create engine wrapper
const engine = new BetterSQLite3Engine(db);

// 3. Create adapter with auto-schema
const adapter = new SQLiteAdapter(engine);

// 4. Define your model
class Post extends Model {
  static tableName = 'posts';

  declare id?: number;
  declare title: string;
  declare views: number;
}

Post.init({
  title: new CharField({ maxLength: 200 }),
  views: new IntegerField({ default: 0, index: true }), // Indexed!
});

// 5. Set adapter and connect
Post.setAdapter(adapter);
await adapter.connect(); // Auto-generates schema!

// 6. Use normally
const post = await Post.objects.create({
  title: 'Hello SQLite!',
  views: 100
});

console.log(post.title); // "Hello SQLite!"
```

**Features:**
- ✅ Fastest performance (native bindings)
- ✅ WAL mode for better concurrency
- ✅ Persistent file storage
- ✅ Works with Electron

---

### 🌐 Browser (SQL.js WASM)

**Recommended for:** PWAs, offline-first web apps

```typescript
import initSqlJs from 'sql.js';
import { SQLiteAdapter, SqlJsEngine } from 'linquery/adapters';
import { Model, CharField } from 'linquery';

// 1. Initialize SQL.js WASM
const SQL = await initSqlJs({
  locateFile: file => `https://sql.js.org/dist/${file}`
});

// 2. Create database (in-memory)
const db = new SQL.Database();

// 3. Create engine wrapper
const engine = new SqlJsEngine(db);

// 4. Create adapter
const adapter = new SQLiteAdapter(engine);

// 5. Define model
class User extends Model {
  static tableName = 'users';

  declare id?: number;
  declare email: string;
}

User.init({
  email: new CharField({ maxLength: 100, unique: true, index: true }),
});

User.setAdapter(adapter);
await adapter.connect();

// 6. Use normally
const user = await User.objects.create({
  email: 'user@example.com'
});

// 7. Export to persist (optional)
const data = engine.export(); // Uint8Array
localStorage.setItem('database', JSON.stringify(Array.from(data)));
```

**Persistence Example:**

```typescript
// Load existing database
const savedData = localStorage.getItem('database');
if (savedData) {
  const buffer = new Uint8Array(JSON.parse(savedData));
  db = new SQL.Database(buffer);
}

// Save on changes
window.addEventListener('beforeunload', () => {
  const data = engine.export();
  localStorage.setItem('database', JSON.stringify(Array.from(data)));
});
```

**Features:**
- ✅ No native dependencies
- ✅ Works in all modern browsers
- ✅ Can persist to localStorage/IndexedDB
- ⚠️ Slower than native (WASM overhead)
- ⚠️ In-memory only (unless you persist manually)

---

### 📱 React Native / Expo

**Recommended for:** Mobile apps, cross-platform apps

```typescript
import * as SQLite from 'expo-sqlite';
import { SQLiteAdapter, ExpoSQLiteEngine } from 'linquery/adapters';
import { Model, CharField, BooleanField } from 'linquery';

// 1. Open database
const db = SQLite.openDatabaseSync('myapp.db');

// 2. Create engine wrapper
const engine = new ExpoSQLiteEngine(db);

// 3. Create adapter
const adapter = new SQLiteAdapter(engine);

// 4. Define model
class Task extends Model {
  static tableName = 'tasks';

  declare id?: number;
  declare text: string;
  declare completed: boolean;
}

Task.init({
  text: new CharField({ maxLength: 200 }),
  completed: new BooleanField({ default: false, index: true }),
});

Task.setAdapter(adapter);
await adapter.connect();

// 5. Use normally
const task = await Task.objects.create({
  text: 'Buy groceries',
  completed: false
});

// Query
const incompleteTasks = await Task.objects.filter({ completed: false });
```

**Features:**
- ✅ Native performance
- ✅ Persistent disk storage
- ✅ Works with Expo Go
- ✅ Cross-platform (iOS + Android)

---

## Auto-Schema Generation

**No more triple duplication!** Just define your fields once with `index: true`:

```typescript
class Product extends Model {
  static tableName = 'products';

  declare id?: number;
  declare name: string;
  declare price: number;
  declare category: string;
}

Product.init({
  name: new CharField({ maxLength: 100, index: true }),      // Indexed
  price: new IntegerField({ index: true }),                  // Indexed
  category: new CharField({ maxLength: 50, index: true }),   // Indexed
});

Product.setAdapter(adapter);
await adapter.connect();

// Generated SQL:
// CREATE TABLE IF NOT EXISTS "products" (
//   "id" INTEGER PRIMARY KEY AUTOINCREMENT,
//   "name" TEXT NOT NULL,
//   "price" INTEGER NOT NULL,
//   "category" TEXT NOT NULL,
//   CREATE INDEX idx_products_name ON products(name),
//   CREATE INDEX idx_products_price ON products(price),
//   CREATE INDEX idx_products_category ON products(category)
// )
```

**When to index:**
- ✅ Fields you filter/query by frequently
- ✅ Foreign keys
- ✅ Unique fields (automatically indexed)
- ❌ Large text fields
- ❌ Fields you never query

## Advanced Usage

### Transactions

```typescript
const engine = new BetterSQLite3Engine(db);

engine.transaction(() => {
  // All or nothing - ACID compliant
  adapter.create(Post, { title: 'Post 1' });
  adapter.create(Post, { title: 'Post 2' });
  adapter.create(Post, { title: 'Post 3' });
});
```

### Foreign Keys

```typescript
class Author extends Model {
  static tableName = 'authors';
  declare id?: number;
  declare name: string;
}

class Book extends Model {
  static tableName = 'books';
  declare id?: number;
  declare title: string;
  declare author_id: number;
}

Book.init({
  title: new CharField({ maxLength: 200 }),
  author_id: new ForeignKeyField(Author, {
    onDelete: 'CASCADE',
    index: true
  }),
});

// Schema includes foreign key constraint:
// FOREIGN KEY ("author_id") REFERENCES "authors"(id) ON DELETE CASCADE
```

### Complex Queries

All linquery query features work:

```typescript
// Lookups
const popular = await Post.objects.filter({ views__gt: 1000 });
const recent = await Post.objects.filter({ title__icontains: 'javascript' });

// Ordering
const latest = await Post.objects.orderBy('-createdAt').limit(10);

// Pagination
const page2 = await Post.objects.limit(20).offset(20);

// Count & Exists
const count = await Post.objects.filter({ published: true }).count();
const hasPublished = await Post.objects.filter({ published: true }).exists();

// Range
const thisWeek = await Post.objects.filter({
  createdAt__range: [startDate, endDate]
});
```

### Multiple Models

```typescript
const adapter = new SQLiteAdapter(engine); // One adapter for all

class Post extends Model {
  static tableName = 'posts';
}

class Comment extends Model {
  static tableName = 'comments';
}

class User extends Model {
  static tableName = 'users';
}

// Initialize all models
Post.init({ /* fields */ });
Comment.init({ /* fields */ });
User.init({ /* fields */ });

// Set same adapter
Post.setAdapter(adapter);
Comment.setAdapter(adapter);
User.setAdapter(adapter);

// Connect once - schema auto-generated for all 3 models!
await adapter.connect();
```

## Configuration Options

```typescript
const adapter = new SQLiteAdapter(engine, {
  // Auto-generate schema from models (default: true)
  autoSchema: true,

  // Database version for migrations (default: 1)
  version: 1,

  // Clear all tables on connect - useful for testing (default: false)
  clearOnConnect: false,

  // Enable foreign key constraints (default: true)
  foreignKeys: true,

  // Enable WAL mode for better concurrency - Node.js only (default: true)
  wal: true,
});
```

## Field Type Mapping

| linquery Field | SQLite Type | Notes |
|----------------|-------------|-------|
| CharField | TEXT | String data |
| TextField | TEXT | Long text |
| IntegerField | INTEGER | Whole numbers |
| FloatField | REAL | Decimals |
| BooleanField | INTEGER | 0 or 1 |
| DateTimeField | TEXT | ISO 8601 strings |
| DateField | TEXT | YYYY-MM-DD |
| JSONField | TEXT | JSON.stringify |
| ForeignKeyField | INTEGER | References id |

## Platform-Specific Notes

### Node.js (better-sqlite3)

**Pros:**
- Fastest performance
- WAL mode support
- Synchronous API (simpler code)
- File-based persistence

**Cons:**
- Requires native compilation
- Not available in browser

### Browser (SQL.js)

**Pros:**
- No native dependencies
- Works everywhere
- Small bundle size (~500KB)

**Cons:**
- In-memory only (unless you persist manually)
- Slower than native
- No WAL mode

**Persistence Strategy:**

```typescript
// Save periodically
setInterval(() => {
  const data = engine.export();
  await saveToIndexedDB('database', data);
}, 5000);

// Load on startup
const savedData = await loadFromIndexedDB('database');
if (savedData) {
  db = new SQL.Database(savedData);
}
```

### React Native (expo-sqlite)

**Pros:**
- Native performance
- Persistent storage
- Cross-platform
- Works with Expo Go

**Cons:**
- Larger app size
- Platform-specific builds

## Migration Example

```typescript
const adapter = new SQLiteAdapter(engine, {
  version: 2, // Increment version
});

// When version changes, run migrations
// TODO: Full migration system coming soon

// For now, you can run manual migrations:
if (currentVersion === 1 && newVersion === 2) {
  engine.run('ALTER TABLE posts ADD COLUMN featured INTEGER DEFAULT 0');
}
```

## Testing

### Node.js Tests

```typescript
import Database from 'better-sqlite3';

describe('My App Tests', () => {
  let db: Database.Database;
  let adapter: SQLiteAdapter;

  beforeEach(() => {
    // Use in-memory database for tests
    db = new Database(':memory:');
    const engine = new BetterSQLite3Engine(db);
    adapter = new SQLiteAdapter(engine, { clearOnConnect: true });
  });

  afterEach(() => {
    db.close();
  });

  it('should create a post', async () => {
    Post.setAdapter(adapter);
    await adapter.connect();

    const post = await Post.objects.create({ title: 'Test' });
    expect(post.id).toBe(1);
  });
});
```

## Performance Tips

1. **Index Wisely**: Only index fields you actually query
2. **Use Transactions**: Batch writes in transactions (100x faster)
3. **Limit Results**: Use `.limit()` for pagination
4. **Prepare Statements**: Reuse prepared statements for repeated queries
5. **WAL Mode**: Enable WAL mode on Node.js for better write concurrency

## Comparison with Other Adapters

| Feature | SQLiteAdapter | DexieAdapter | LocalStorageAdapter |
|---------|---------------|--------------|---------------------|
| Storage | SQLite DB | IndexedDB | localStorage |
| Capacity | Unlimited* | ~GB | ~5-10MB |
| Platforms | All | Browser only | Browser only |
| Indexing | SQL indexes | Dexie indexes | None |
| Speed | ⚡⚡⚡ | ⚡⚡ | ⚡ |
| Setup | Medium | Easy | Easiest |
| ACID | Yes | Yes | No |
| Transactions | Yes | Yes | No |

*Subject to disk space/quota

## Troubleshooting

### better-sqlite3 won't install

```bash
# Rebuild for your platform
npm rebuild better-sqlite3

# Or use pre-built binaries
npm install better-sqlite3 --build-from-source
```

### SQL.js not loading

```typescript
// Specify WASM file location
const SQL = await initSqlJs({
  locateFile: file => `/path/to/${file}`
});
```

### expo-sqlite not found

```bash
# Use expo install (not npm)
npx expo install expo-sqlite
```

## Resources

- [better-sqlite3 Documentation](https://github.com/WiseLibs/better-sqlite3)
- [SQL.js Documentation](https://sql.js.org/)
- [Expo SQLite Documentation](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- [SQLite SQL Reference](https://www.sqlite.org/lang.html)
