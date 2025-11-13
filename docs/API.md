# API Reference

Complete API documentation with examples.

## Table of Contents

- [Models](#models)
- [Fields](#fields)
- [QuerySets](#querysets)
- [Managers](#managers)
- [Relationships](#relationships)
- [Signals](#signals)
- [Validation](#validation)
- [Transactions](#transactions)

## Models

### Defining Models

```typescript
import { Model, CharField, IntegerField, TextField, Manager } from 'linquery';

class Author extends Model {
  // Type declarations for model fields
  declare id?: number;
  declare name: string;
  declare age?: number;
  declare bio?: string;

  // Static manager
  static objects: Manager<Author>;

  // Custom methods
  getDisplayName(): string {
    return `${this.name} (${this.age})`;
  }

  // Validation
  async clean(): Promise<void> {
    if (this.age && this.age < 0) {
      throw new ValidationError('Age cannot be negative');
    }
  }
}

// Initialize the model with field definitions
Author.init({
  name: new CharField({ maxLength: 100 }),
  age: new IntegerField({ required: false }),
  bio: new TextField({ required: false }),
}, {
  tableName: 'authors',  // Optional: defaults to lowercase class name
});
```

### Model Configuration

```typescript
class MyModel extends Model {
  declare id?: number;
  declare field1: string;
  declare field2: string;
  declare field3: number;
  declare created_at: Date;
  declare name: string;

  static objects: Manager<MyModel>;
}

MyModel.init({
  field1: new CharField({ maxLength: 100 }),
  field2: new CharField({ maxLength: 100 }),
  field3: new IntegerField(),
  created_at: new DateTimeField({ autoNowAdd: true }),
  name: new CharField({ maxLength: 100 }),
}, {
  tableName: 'my_custom_table',  // Optional: default is lowercase class name
  primaryKey: 'id',  // Optional: default is 'id'
});

// Note: The 'id' field is automatically added as an IntegerField if not provided
// Features like ordering, uniqueTogether, indexes are adapter-specific and will be
// documented in adapter-specific sections
```

### Model Methods

#### Instance Methods

```typescript
const author = new Author({ name: 'John', age: 30 });

// Save (insert or update)
await author.save();

// Delete
await author.delete();

// Refresh from database
await author.refresh();

// Validate
const errors = await author.validate();

// Serialize
const json = author.toJSON();

// Check if saved
author.isNew();  // true if not yet saved
```

#### Class Methods

```typescript
// Create and save in one step
const author = await Author.objects.create({
  name: 'Jane',
  age: 25,
});

// Get by ID
const author = await Author.objects.get({ id: 1 });

// Bulk operations
const authors = await Author.objects.bulkCreate([
  { name: 'John', age: 30 },
  { name: 'Jane', age: 25 },
]);
```

## Fields

### CharField

String field with maximum length.

```typescript
class User extends Model {
  declare id?: number;
  declare username: string;
  declare email: string;

  static objects: Manager<User>;
}

User.init({
  username: new CharField({
    maxLength: 50,
    minLength: 3,
    required: true,
    unique: true,
    default: 'anonymous',
  }),
  email: new CharField({
    maxLength: 255,
    validators: [emailValidator],
  }),
});
```

### TextField

Long text field.

```typescript
class Post extends Model {
  declare id?: number;
  declare content: string;
  declare excerpt?: string;

  static objects: Manager<Post>;
}

Post.init({
  content: new TextField({
    required: true,
  }),
  excerpt: new TextField({
    required: false,
    maxLength: 500,
  }),
});
```

### IntegerField

Integer number field.

```typescript
class Product extends Model {
  declare id?: number;
  declare quantity: number;
  declare price: number;

  static objects: Manager<Product>;
}

Product.init({
  quantity: new IntegerField({
    min: 0,
    max: 1000,
    default: 0,
  }),
  price: new IntegerField({
    required: true,
  }),
});
```

### FloatField

Floating point number field.

```typescript
class Measurement extends Model {
  declare id?: number;
  declare value: number;

  static objects: Manager<Measurement>;
}

Measurement.init({
  value: new FloatField({
    min: 0.0,
    max: 100.0,
    precision: 2,  // Decimal places
  }),
});
```

### BooleanField

Boolean field.

```typescript
class Article extends Model {
  declare id?: number;
  declare published: boolean;
  declare featured: boolean;

  static objects: Manager<Article>;
}

Article.init({
  published: new BooleanField({
    default: false,
  }),
  featured: new BooleanField({
    required: true,
  }),
});
```

### DateTimeField

Date and time field.

```typescript
class Post extends Model {
  declare id?: number;
  declare createdAt: Date;
  declare updatedAt: Date;
  declare publishedAt?: Date;

  static objects: Manager<Post>;
}

Post.init({
  createdAt: new DateTimeField({
    autoNowAdd: true,  // Set on creation
  }),
  updatedAt: new DateTimeField({
    autoNow: true,  // Update on every save
  }),
  publishedAt: new DateTimeField({
    required: false,
  }),
});
```

### DateField

Date only field.

```typescript
class Event extends Model {
  declare id?: number;
  declare date: Date;
  declare endDate?: Date;

  static objects: Manager<Event>;
}

Event.init({
  date: new DateField({
    required: true,
  }),
  endDate: new DateField({
    required: false,
  }),
});
```

### JSONField

Store JSON objects.

```typescript
class Config extends Model {
  declare id?: number;
  declare settings: Record<string, unknown>;
  declare metadata?: Record<string, unknown>;

  static objects: Manager<Config>;
}

Config.init({
  settings: new JSONField({
    default: {},
  }),
  metadata: new JSONField({
    required: false,
  }),
});

// Usage
const config = await Config.objects.create({
  settings: { theme: 'dark', language: 'en' },
});

console.log(config.settings.theme);  // 'dark'
```

### ChoiceField

Field with limited choices.

```typescript
class Article extends Model {
  declare id?: number;
  declare status: 'draft' | 'published' | 'archived';

  static objects: Manager<Article>;
}

Article.init({
  status: new ChoiceField({
    choices: ['draft', 'published', 'archived'],
    default: 'draft',
  }),
});

// Usage
article.status = 'published';  // Valid
article.status = 'invalid';    // TypeScript error
```

### Custom Fields

```typescript
class EmailField extends CharField {
  constructor(options = {}) {
    super({
      ...options,
      maxLength: 255,
      validators: [emailValidator],
    });
  }

  override toDB(value: string): string {
    return value.toLowerCase();
  }

  override fromDB(value: string): string {
    return value.toLowerCase();
  }
}

// Usage
class User extends Model {
  declare id?: number;
  declare email: string;

  static objects: Manager<User>;
}

User.init({
  email: new EmailField({ required: true }),
});
```

## QuerySets

### Creating QuerySets

```typescript
// All objects
const allBooks = Book.objects.all();

// Filtered
const publishedBooks = Book.objects.filter({ published: true });

// Chained
const recentBooks = Book.objects
  .filter({ published: true })
  .order_by('-created_at')
  .limit(10);
```

### Filtering

#### Basic Filters

```typescript
// Exact match
Book.objects.filter({ title: 'Django Guide' });

// Multiple conditions (AND)
Book.objects.filter({
  published: true,
  pages__gte: 200,
});

// Exclude (NOT)
Book.objects
  .filter({ published: true })
  .exclude({ title__contains: 'test' });
```

#### Field Lookups

Django-style field lookups allow you to perform complex queries using the `field__lookup` syntax.

##### Exact Match

```typescript
// Exact match (default)
Book.objects.filter({ title: 'Django Guide' });
Book.objects.filter({ title__exact: 'Django Guide' });  // Same as above

// Case-insensitive exact match
Book.objects.filter({ title__iexact: 'django guide' });  // Matches 'Django Guide'
```

##### Comparison Lookups

```typescript
// Greater than
Book.objects.filter({ pages__gt: 200 });  // Books with more than 200 pages

// Greater than or equal
Book.objects.filter({ pages__gte: 200 });  // Books with 200 or more pages

// Less than
Book.objects.filter({ price__lt: 50 });  // Books cheaper than $50

// Less than or equal
Book.objects.filter({ price__lte: 50 });  // Books $50 or cheaper
```

##### String Lookups

```typescript
// Contains substring (case-sensitive)
Book.objects.filter({ title__contains: 'Django' });  // Matches 'Django Guide', 'Learning Django'

// Case-insensitive contains
Book.objects.filter({ title__icontains: 'django' });  // Matches 'Django', 'DJANGO', 'django'

// Starts with (case-sensitive)
Book.objects.filter({ title__startswith: 'The' });  // Matches 'The Django Book'

// Case-insensitive starts with
Book.objects.filter({ title__istartswith: 'the' });  // Matches 'The Django Book'

// Ends with (case-sensitive)
Book.objects.filter({ title__endswith: 'Guide' });  // Matches 'Django Guide'

// Case-insensitive ends with
Book.objects.filter({ title__iendswith: 'guide' });  // Matches 'Django Guide', 'REST API GUIDE'
```

##### List and Range Lookups

```typescript
// In a list of values
Book.objects.filter({ status__in: ['published', 'featured'] });
Book.objects.filter({ id__in: [1, 5, 10, 15] });

// Range (inclusive on both ends)
Book.objects.filter({ pages__range: [100, 300] });  // 100 <= pages <= 300
Book.objects.filter({ price__range: [10.0, 50.0] });  // $10 to $50
```

##### Null Checks

```typescript
// Is null or undefined
Book.objects.filter({ deletedAt__isnull: true });

// Is not null
Book.objects.filter({ publishedAt__isnull: false });
```

##### Date Lookups

```typescript
// Year
Book.objects.filter({ published__year: 2024 });

// Month (1-12)
Book.objects.filter({ published__month: 1 });  // January

// Day (1-31)
Book.objects.filter({ published__day: 15 });
```

**Note:** Date lookups require proper date serialization support in your adapter. See the adapter documentation for details.

##### Combining Lookups

```typescript
// Chain multiple filters (AND logic)
Book.objects
  .filter({ published: true })
  .filter({ pages__gte: 200 })
  .filter({ title__icontains: 'python' });

// Multiple conditions in one filter (also AND)
Book.objects.filter({
  published: true,
  pages__gte: 200,
  price__lt: 50,
});

// Exclude with lookups (NOT)
Book.objects
  .filter({ published: true })
  .exclude({ title__contains: 'draft' });
```

##### Relationship Traversal

**Note:** Relationship traversal is planned for future versions.

```typescript
// Follow relationships with __ syntax
Book.objects.filter({ author__name: 'John Smith' });
Book.objects.filter({ author__age__gte: 30 });
Book.objects.filter({ author__publisher__country: 'US' });
```

### Ordering

```typescript
// Ascending
Book.objects.order_by('title');

// Descending (prefix with -)
Book.objects.order_by('-created_at');

// Multiple fields
Book.objects.order_by('-published', 'title');

// Random
Book.objects.order_by('?');
```

### Slicing

```typescript
// Limit
Book.objects.limit(10);

// Offset
Book.objects.offset(20);

// Combined (pagination)
Book.objects.limit(10).offset(20);

// Array slicing syntax
Book.objects.all()[0:10];  // First 10
Book.objects.all()[10:20]; // Next 10
```

### Field Selection

Optimize queries by fetching only specific fields.

#### only()

Fetch only specified fields (plus primary key):

```typescript
// Only fetch id, title, and created_at
// Useful when content field is very large
const posts = await Post.objects.only('title', 'created_at').all();

posts[0].title;      // ✅ Available
posts[0].created_at; // ✅ Available
posts[0].content;    // ⚠️  Not loaded - will be undefined or require lazy fetch

// With relationships - fetch specific fields from related objects
const books = await Book.objects
  .select_related('author')
  .only('title', 'author__name')
  .all();

books[0].title;        // ✅ Available
books[0].author.name;  // ✅ Available
books[0].pages;        // ⚠️  Not loaded
books[0].author.bio;   // ⚠️  Not loaded
```

**SQL Example:**
```typescript
Post.objects.only('title', 'created_at')
// Generates: SELECT id, title, created_at FROM posts
```

**GraphQL Example:**
```typescript
Post.objects.only('title', 'created_at')
// Generates: query { posts { id title createdAt } }
```

#### defer()

Fetch all fields except specified ones:

```typescript
// Fetch everything except large text fields
const posts = await Post.objects.defer('content', 'raw_html').all();

posts[0].title;    // ✅ Available
posts[0].content;  // ⚠️  Deferred

// Useful for list views where you don't need full content
const postList = await Post.objects
  .defer('content')
  .filter({ published: true })
  .order_by('-created_at')
  .all();
```

**SQL Example:**
```typescript
Post.objects.defer('content')
// Generates: SELECT id, title, author_id, created_at, ... FROM posts
//            (all fields except 'content')
```

**Benefits:**
- Reduced network bandwidth
- Faster queries (especially with large text/JSON fields)
- Lower memory usage
- Optimized GraphQL queries

**Note:** Primary key (id) is always fetched, even with `only()`.

### Selecting Related Objects

#### select_related (for ForeignKey)

```typescript
// Without select_related (N+1 problem)
const books = await Book.objects.all();
for (const book of books) {
  const author = await book.author;  // N queries!
  console.log(author.name);
}

// With select_related (1 query with JOIN)
const books = await Book.objects.select_related('author').all();
for (const book of books) {
  console.log(book.author.name);  // No await needed!
}

// Multiple relations
Book.objects.select_related('author', 'publisher');

// Nested relations
Book.objects.select_related('author__country');
```

#### prefetch_related (for ManyToMany and reverse ForeignKey)

```typescript
// Prefetch related objects (separate queries, optimized)
const authors = await Author.objects
  .prefetch_related('books')
  .all();

for (const author of authors) {
  const books = author.books;  // Already loaded!
  console.log(books.length);
}

// Multiple prefetch
Author.objects.prefetch_related('books', 'awards');

// Nested prefetch
Author.objects.prefetch_related('books__reviews');
```

### Terminal Methods

Methods that execute the query:

```typescript
// Get all results
const books = await Book.objects.all();

// Get first result
const book = await Book.objects.first();  // null if not found

// Get last result
const book = await Book.objects.last();

// Get single result (raises error if not found or multiple found)
const book = await Book.objects.get({ id: 1 });

// Count
const count = await Book.objects.filter({ published: true }).count();

// Exists
const exists = await Book.objects.filter({ title: 'Django' }).exists();
```

### Values and Values List

Return data without instantiating full model instances (more efficient).

#### values()

Returns array of plain objects with specified fields:

```typescript
// Get specific fields as objects
const data = await Book.objects.values('title', 'pages');
// [
//   { title: 'Book 1', pages: 200 },
//   { title: 'Book 2', pages: 350 },
// ]

// All fields
const data = await Book.objects.values();
// [{ id: 1, title: 'Book 1', pages: 200, author_id: 1 }, ...]

// With filters and ordering
const recentTitles = await Book.objects
  .filter({ published: true })
  .order_by('-created_at')
  .values('title', 'created_at');

// Spanning relationships
const data = await Book.objects.values('title', 'author__name');
// [
//   { title: 'Book 1', author__name: 'John Doe' },
//   { title: 'Book 2', author__name: 'Jane Smith' },
// ]
```

#### values_list()

Returns array of tuples (arrays) with field values:

```typescript
// Single field - returns array of arrays
const titles = await Book.objects.values_list('title');
// [['Book 1'], ['Book 2'], ['Book 3']]

// Multiple fields - returns array of tuples
const data = await Book.objects.values_list('title', 'pages');
// [
//   ['Book 1', 200],
//   ['Book 2', 350],
//   ['Book 3', 180],
// ]

// Destructuring
for (const [title, pages] of await Book.objects.values_list('title', 'pages')) {
  console.log(`${title}: ${pages} pages`);
}

// Spanning relationships
const data = await Book.objects.values_list('title', 'author__name', 'author__email');
// [['Book 1', 'John Doe', 'john@example.com'], ...]
```

#### values_list() with flat

When querying a single field, use `flat: true` to get a simple array:

```typescript
// Without flat
const titles = await Book.objects.values_list('title');
// [['Book 1'], ['Book 2'], ['Book 3']]

// With flat
const titles = await Book.objects.values_list('title', { flat: true });
// ['Book 1', 'Book 2', 'Book 3']

// Perfect for dropdowns, tags, etc.
const authorNames = await Author.objects
  .order_by('name')
  .values_list('name', { flat: true });
// ['Alice', 'Bob', 'Charlie']

// Get all IDs
const bookIds = await Book.objects
  .filter({ published: true })
  .values_list('id', { flat: true });
// [1, 3, 5, 7, 9]
```

#### Performance Comparison

```typescript
// Full model instances (most memory)
const books = await Book.objects.all();
// Returns: [Book { id: 1, title: '...', ... }, ...]

// Plain objects (medium memory)
const books = await Book.objects.values();
// Returns: [{ id: 1, title: '...', ... }, ...]

// Tuples (least memory)
const books = await Book.objects.values_list('id', 'title');
// Returns: [[1, 'Book 1'], [2, 'Book 2'], ...]

// Single flat list (least memory for single field)
const titles = await Book.objects.values_list('title', { flat: true });
// Returns: ['Book 1', 'Book 2', ...]
```

#### Use Cases

```typescript
// 1. Building select dropdowns
const options = (await Author.objects.values_list('id', 'name')).map(
  ([id, name]) => ({ value: id, label: name })
);

// 2. Getting unique values
const categories = await Post.objects
  .values_list('category', { flat: true })
  .distinct();

// 3. CSV export
const csvData = await Book.objects.values_list('title', 'author__name', 'pages');
const csv = csvData.map(row => row.join(',')).join('\n');

// 4. Quick counts by field
const statusCounts = await Order.objects
  .values('status')
  .annotate({ count: Count('id') });
// [{ status: 'pending', count: 10 }, { status: 'completed', count: 50 }]
```

### Async Iteration

```typescript
// Iterate over results
for await (const book of Book.objects.filter({ published: true })) {
  console.log(book.title);
}
```

### Complex Queries

#### Q Objects (OR, AND, NOT)

```typescript
import { Q } from 'orm-js';

// OR
Book.objects.filter(
  Q({ title__contains: 'Django' }).or({ title__contains: 'Python' })
);

// AND
Book.objects.filter(
  Q({ published: true }).and({ pages__gte: 200 })
);

// NOT
Book.objects.filter(
  Q({ published: true }).and(Q({ title__contains: 'test' }).not())
);

// Complex
Book.objects.filter(
  Q({ published: true }).and(
    Q({ pages__gte: 200 }).or({ featured: true })
  )
);
```

### Aggregation

```typescript
import { Avg, Count, Max, Min, Sum } from 'orm-js';

// Count
const count = await Book.objects.count();

// Aggregate
const stats = await Book.objects.aggregate({
  avgPages: Avg('pages'),
  totalPages: Sum('pages'),
  maxPages: Max('pages'),
  minPages: Min('pages'),
  bookCount: Count('id'),
});
// { avgPages: 250, totalPages: 5000, maxPages: 500, ... }

// Group by
const byAuthor = await Book.objects
  .values('author')
  .annotate({ bookCount: Count('id') });
// [{ author: 1, bookCount: 5 }, { author: 2, bookCount: 3 }]
```

### Update and Delete

```typescript
// Update
await Book.objects
  .filter({ published: false })
  .update({ published: true });

// Delete
await Book.objects
  .filter({ created_at__lt: '2020-01-01' })
  .delete();

// Get count of updated/deleted
const { count } = await Book.objects.filter({...}).delete();
console.log(`Deleted ${count} books`);
```

## Managers

### Default Manager

Every model has a default `objects` manager:

```typescript
class Book extends Model {
  declare id?: number;
  declare title: string;

  static objects: Manager<Book>;
}

Book.init({
  title: new CharField({ maxLength: 200 }),
});

Book.objects.all();  // Default manager
```

### Custom Managers

```typescript
class PublishedManager extends Manager<Book> {
  all() {
    return super.all().filter({ published: true });
  }

  byAuthor(authorId: number) {
    return this.filter({ author_id: authorId });
  }
}

class Book extends Model {
  declare id?: number;
  declare title: string;
  declare published: boolean;

  static objects = new Manager(Book);
  static published = new PublishedManager(Book);
}

Book.init({
  title: new CharField({ maxLength: 200 }),
  published: new BooleanField({ default: false }),
});

// Usage
await Book.objects.all();       // All books
await Book.published.all();     // Only published books
await Book.published.byAuthor(1);  // Published books by author 1
```

### Multiple Managers

```typescript
class ArticleManager extends Manager<Article> {
  published() {
    return this.filter({ status: 'published' });
  }
}

class FeaturedManager extends Manager<Article> {
  all() {
    return super.all().filter({ featured: true });
  }
}

class Article extends Model {
  declare id?: number;
  declare status: string;
  declare featured: boolean;

  static objects = new ArticleManager(Article);
  static featured = new FeaturedManager(Article);
}

Article.init({
  status: new CharField({ maxLength: 50 }),
  featured: new BooleanField({ default: false }),
});

// Usage
await Article.objects.all();          // All articles
await Article.objects.published();    // Published articles
await Article.featured.all();         // Featured articles
```

## Relationships

### ForeignKey (Many-to-One)

**Note:** Relationship fields (ForeignKey, OneToOneField, ManyToManyField) are planned for future implementation. The examples below show the intended API design.

```typescript
class Book extends Model {
  declare id?: number;
  declare title: string;
  declare author: Author;

  static objects: Manager<Book>;
}

Book.init({
  title: new CharField({ maxLength: 200 }),
  author: new ForeignKey(Author, {
    relatedName: 'books',  // Reverse relation name
    onDelete: 'CASCADE',    // Cascade delete
  }),
});

// Forward relation (lazy by default)
const book = await Book.objects.get({ id: 1 });
const author = await book.author;

// Eager loading
const book = await Book.objects.select_related('author').get({ id: 1 });
console.log(book.author.name);  // No await needed

// Reverse relation
const author = await Author.objects.get({ id: 1 });
const books = await author.books.all();
const bookCount = await author.books.count();
await author.books.filter({ published: true });
```

### OneToOneField

**Note:** Relationship fields are planned for future implementation.

```typescript
class UserProfile extends Model {
  declare id?: number;
  declare user: User;
  declare bio: string;

  static objects: Manager<UserProfile>;
}

UserProfile.init({
  user: new OneToOneField(User, {
    relatedName: 'profile',
    onDelete: 'CASCADE',
  }),
  bio: new TextField(),
});

// Access
const user = await User.objects.get({ id: 1 });
const profile = await user.profile;  // Returns single instance

const profile = await UserProfile.objects.get({ user_id: 1 });
const user = await profile.user;
```

### ManyToManyField

**Note:** Relationship fields are planned for future implementation.

```typescript
class Book extends Model {
  declare id?: number;
  declare title: string;
  declare tags: Tag[];

  static objects: Manager<Book>;
}

Book.init({
  title: new CharField({ maxLength: 200 }),
  tags: new ManyToManyField(Tag, {
    relatedName: 'books',
  }),
});

// Add
const book = await Book.objects.get({ id: 1 });
await book.tags.add(tag1, tag2);

// Remove
await book.tags.remove(tag1);

// Clear all
await book.tags.clear();

// Set (replace all)
await book.tags.set([tag1, tag2, tag3]);

// Query
const tags = await book.tags.all();
const count = await book.tags.count();

// Filter
await book.tags.filter({ name__startswith: 'tech' });

// Reverse
const tag = await Tag.objects.get({ id: 1 });
const books = await tag.books.all();
```

### Through Model (Custom M2M)

**Note:** Relationship fields are planned for future implementation.

```typescript
class Membership extends Model {
  declare id?: number;
  declare person: Person;
  declare group: Group;
  declare dateJoined: Date;
  declare role: string;

  static objects: Manager<Membership>;
}

Membership.init({
  person: new ForeignKey(Person),
  group: new ForeignKey(Group),
  dateJoined: new DateField(),
  role: new CharField({ maxLength: 50 }),
});

class Person extends Model {
  declare id?: number;
  declare name: string;
  declare groups: Group[];

  static objects: Manager<Person>;
}

Person.init({
  name: new CharField({ maxLength: 100 }),
  groups: new ManyToManyField(Group, {
    through: Membership,
    relatedName: 'members',
  }),
});

// Access through model
const person = await Person.objects.get({ id: 1 });
const memberships = await Membership.objects.filter({ person });

for (const membership of memberships) {
  console.log(membership.group, membership.role);
}
```

### Cross-Adapter Relationships

**Note:** Relationship fields and cross-adapter support are planned for future implementation.

```typescript
// User stored in GraphQL
class User extends Model {
  declare id?: number;
  declare username: string;

  static objects: Manager<User>;
}

User.init({
  username: new CharField({ maxLength: 100 }),
}, {
  adapter: new GraphQLAdapter({ endpoint: '/graphql' }),
});

// Session stored in Memory
class Session extends Model {
  declare id?: number;
  declare token: string;
  declare user: User;

  static objects: Manager<Session>;
}

Session.init({
  token: new CharField({ maxLength: 255 }),
  user: new ForeignKey(User, {
    relatedName: 'sessions',
    crossAdapter: true,  // Enable cross-adapter
  }),
}, {
  adapter: new MemoryAdapter(),
});

// Works seamlessly
const session = await Session.objects.get({ token: 'abc' });
const user = await session.user;  // Fetches from GraphQL

const user = await User.objects.get({ id: 1 });  // From GraphQL
const sessions = await user.sessions.all();  // From Memory
```

## Signals

See [SIGNALS.md](./SIGNALS.md) for detailed documentation.

### Quick Reference

```typescript
import { signal, SignalType } from 'orm-js';

// Listen to post-save
signal(SignalType.POST_SAVE).connect(
  async (sender, instance, created) => {
    console.log(`${sender.name} saved`, created ? '(new)' : '(updated)');
  },
  { sender: User }  // Optional: only for User model
);

// Available signals
SignalType.PRE_INIT
SignalType.POST_INIT
SignalType.PRE_SAVE
SignalType.POST_SAVE
SignalType.PRE_DELETE
SignalType.POST_DELETE
SignalType.M2M_CHANGED
SignalType.PRE_SYNC
SignalType.POST_SYNC
SignalType.SYNC_CONFLICT
```

## Validation

### Field Validation

```typescript
class User extends Model {
  declare id?: number;
  declare age: number;
  declare email: string;

  static objects: Manager<User>;
}

User.init({
  age: new IntegerField({
    min: 0,
    max: 150,
    required: true,
  }),
  email: new CharField({
    maxLength: 255,
    validators: [emailValidator],
  }),
});

// Validation runs automatically on save
const user = new User({ age: -5 });
await user.save();  // Throws ValidationError
```

### Custom Validation

```typescript
class User extends Model {
  declare id?: number;
  declare password: string;
  declare passwordConfirm: string;

  static objects: Manager<User>;

  async clean(): Promise<void> {
    if (this.password !== this.passwordConfirm) {
      throw new ValidationError({
        passwordConfirm: ['Passwords do not match'],
      });
    }
  }
}

User.init({
  password: new CharField({ maxLength: 255 }),
  passwordConfirm: new CharField({ maxLength: 255 }),
});
```

### Custom Validators

```typescript
function minLengthValidator(minLength: number) {
  return (value: string) => {
    if (value.length < minLength) {
      throw new ValidationError(
        `Must be at least ${minLength} characters`
      );
    }
  };
}

class User extends Model {
  declare id?: number;
  declare username: string;

  static objects: Manager<User>;
}

User.init({
  username: new CharField({
    validators: [
      minLengthValidator(3),
      alphanumericValidator,
    ],
  }),
});
```

## Transactions

Transactions are adapter-specific. Not all adapters support them.

```typescript
// Using transaction
await Book.adapter.transaction(async () => {
  const author = await Author.objects.create({ name: 'John' });
  const book = await Book.objects.create({
    title: 'My Book',
    author,
  });

  // If any operation fails, all are rolled back
});

// Nested transactions (if adapter supports savepoints)
await Book.adapter.transaction(async () => {
  await Author.objects.create({ name: 'John' });

  await Book.adapter.transaction(async () => {
    await Book.objects.create({ title: 'Book 1' });
  });
});
```

## Complete Example

```typescript
import {
  Model,
  Manager,
  CharField,
  TextField,
  IntegerField,
  BooleanField,
  DateTimeField,
  ValidationError,
} from 'linquery';
import { MemoryAdapter } from 'linquery/adapters';

// Configure adapter
const adapter = new MemoryAdapter();

// Define Author model
class Author extends Model {
  declare id?: number;
  declare name: string;
  declare email: string;
  declare bio?: string;

  static objects: Manager<Author>;

  async clean() {
    if (!this.email.includes('@')) {
      throw new ValidationError('Invalid email');
    }
  }
}

Author.init({
  name: new CharField({ maxLength: 100 }),
  email: new CharField({ maxLength: 255, unique: true }),
  bio: new TextField({ required: false }),
});

// Set adapter for Author
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Author as any).setAdapter(adapter);
Author.objects = new Manager(Author, adapter);

// Define Tag model
class Tag extends Model {
  declare id?: number;
  declare name: string;

  static objects: Manager<Tag>;
}

Tag.init({
  name: new CharField({ maxLength: 50, unique: true }),
});

// Set adapter for Tag
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Tag as any).setAdapter(adapter);
Tag.objects = new Manager(Tag, adapter);

// Define Book model
class Book extends Model {
  declare id?: number;
  declare title: string;
  declare content: string;
  declare published: boolean;
  declare pages: number;
  declare createdAt: Date;
  declare updatedAt: Date;

  static objects: Manager<Book>;
}

Book.init({
  title: new CharField({ maxLength: 200 }),
  content: new TextField(),
  published: new BooleanField({ default: false }),
  pages: new IntegerField({ min: 1 }),
  createdAt: new DateTimeField({ autoNowAdd: true }),
  updatedAt: new DateTimeField({ autoNow: true }),
});

// Set adapter for Book
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Book as any).setAdapter(adapter);
Book.objects = new Manager(Book, adapter);

// Usage
async function main() {
  // Create author
  const author = await Author.objects.create({
    name: 'John Doe',
    email: 'john@example.com',
  });

  // Create tags
  const techTag = await Tag.objects.create({ name: 'Technology' });
  const webTag = await Tag.objects.create({ name: 'Web Development' });

  // Create book
  const book = await Book.objects.create({
    title: 'Advanced TypeScript',
    content: 'Lorem ipsum dolor sit amet...',
    pages: 350,
    published: true,
  });

  console.log(`Created book: ${book.title} (ID: ${book.id})`);

  // Query books
  const books = await Book.objects
    .filter({ published: true })
    .order_by('-createdAt')
    .limit(10)
    .toArray();

  for (const book of books) {
    console.log(`${book.title} - ${book.pages} pages`);
  }

  // Update a book
  book.pages = 400;
  await book.save();

  // Get count
  const count = await Book.objects.count();
  console.log(`Total books: ${count}`);

  // Delete a book
  await book.delete();
}

main();
```

**Note:** This example shows the current implementation. Relationship fields (ForeignKey, ManyToManyField) and signals are planned for future versions.
