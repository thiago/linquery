/**
 * Integration tests for model relationships
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Model, CharField, IntegerField, Manager, ForeignKeyField, OneToOneField } from '../../src/core';
import { MemoryAdapter } from '../../src/adapters';

// Define test models
class Author extends Model {
  declare id?: number;
  declare name: string;
  declare email: string;

  static objects: Manager<Author>;
}

Author.init({
  name: new CharField({ maxLength: 100 }),
  email: new CharField({ maxLength: 255 }),
});

class Book extends Model {
  declare id?: number;
  declare title: string;
  declare pages: number;
  declare author_id: number;  // The stored foreign key
  declare author: Author | Promise<Author> | null;  // The related instance (lazy loaded)

  static objects: Manager<Book>;
}

Book.init({
  title: new CharField({ maxLength: 200 }),
  pages: new IntegerField(),
  author: new ForeignKeyField(Author, { onDelete: 'CASCADE' }),
});

describe('ForeignKey Relationships', () => {
  let adapter: MemoryAdapter;

  beforeEach(async () => {
    adapter = new MemoryAdapter();

    // Type assertion - see TYPE_ASSERTIONS.md for explanation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Author as any).setAdapter(adapter);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Author.objects = new Manager(Author as any, adapter);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Book as any).setAdapter(adapter);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Book.objects = new Manager(Book as any, adapter);
  });

  describe('Basic ForeignKey Operations', () => {
    it('should create a book with foreign key by ID', async () => {
      // Create author
      const author = await Author.objects.create({
        name: 'John Doe',
        email: 'john@example.com',
      });

      // Create book with author ID
      const book = await Book.objects.create({
        title: 'TypeScript Guide',
        pages: 300,
        author_id: author.id!,
      });

      expect(book.title).toBe('TypeScript Guide');
      expect(book.author_id).toBe(author.id);
    });

    it('should create a book with foreign key by instance', async () => {
      // Create author
      const author = await Author.objects.create({
        name: 'Jane Smith',
        email: 'jane@example.com',
      });

      // Create book with author instance
      const book = await Book.objects.create({
        title: 'JavaScript Basics',
        pages: 250,
        author: author,  // Pass instance instead of ID
      });

      expect(book.title).toBe('JavaScript Basics');
      expect(book.author_id).toBe(author.id);
    });

    it('should lazy load related object', async () => {
      // Create author
      const author = await Author.objects.create({
        name: 'Alice Wonder',
        email: 'alice@example.com',
      });

      // Create book
      const book = await Book.objects.create({
        title: 'Adventures in TypeScript',
        pages: 400,
        author_id: author.id!,
      });

      // Fetch book from database
      const fetchedBook = await Book.objects.get({ id: book.id });

      // author_id should be set
      expect(fetchedBook.author_id).toBe(author.id);

      // Lazy load author (returns promise)
      const loadedAuthor = await fetchedBook.author;

      // Should be the correct author
      expect(loadedAuthor).not.toBeNull();
      expect(loadedAuthor!.id).toBe(author.id);
      expect(loadedAuthor!.name).toBe('Alice Wonder');
      expect(loadedAuthor!.email).toBe('alice@example.com');
    });

    it('should return null for foreign key when ID is null', async () => {
      // Create book without author
      const book = await Book.objects.create({
        title: 'Orphan Book',
        pages: 100,
        author_id: null as any,  // Explicitly null
      });

      // Fetch book
      const fetchedBook = await Book.objects.get({ id: book.id });

      // author_id should be null (stored as null in DB)
      expect(fetchedBook.author_id).toBeNull();

      // author should be null (no lazy load)
      const author = await fetchedBook.author;
      expect(author).toBeNull();
    });

    it('should set foreign key by ID', async () => {
      // Create author and book
      const author1 = await Author.objects.create({
        name: 'Author One',
        email: 'one@example.com',
      });

      const author2 = await Author.objects.create({
        name: 'Author Two',
        email: 'two@example.com',
      });

      const book = await Book.objects.create({
        title: 'Test Book',
        pages: 200,
        author_id: author1.id!,
      });

      // Change author by ID
      book.author = author2.id as any;

      expect(book.author_id).toBe(author2.id);

      // Lazy load should get the new author
      const loadedAuthor = await book.author;
      expect(loadedAuthor!.name).toBe('Author Two');
    });

    it('should set foreign key by instance', async () => {
      // Create authors and book
      const author1 = await Author.objects.create({
        name: 'Author One',
        email: 'one@example.com',
      });

      const author2 = await Author.objects.create({
        name: 'Author Two',
        email: 'two@example.com',
      });

      const book = await Book.objects.create({
        title: 'Test Book',
        pages: 200,
        author_id: author1.id!,
      });

      // Change author by instance
      book.author = author2 as any;

      expect(book.author_id).toBe(author2.id);

      // Should be cached
      const loadedAuthor = await book.author;
      expect(loadedAuthor).toBe(author2);  // Same instance
    });

    it('should cache loaded instances', async () => {
      // Create author and book
      const author = await Author.objects.create({
        name: 'Cached Author',
        email: 'cached@example.com',
      });

      const book = await Book.objects.create({
        title: 'Cache Test',
        pages: 150,
        author_id: author.id!,
      });

      // Load author first time
      const author1 = await book.author;

      // Load author second time
      const author2 = await book.author;

      // Should be the same instance (cached)
      expect(author1).toBe(author2);
    });
  });

  describe('Eager Loading (select_related)', () => {
    it('should eager load related objects with select_related', async () => {
      // Create authors
      const author1 = await Author.objects.create({
        name: 'Eager Author 1',
        email: 'eager1@example.com',
      });

      const author2 = await Author.objects.create({
        name: 'Eager Author 2',
        email: 'eager2@example.com',
      });

      // Create books
      await Book.objects.create({
        title: 'Book 1',
        pages: 100,
        author_id: author1.id!,
      });

      await Book.objects.create({
        title: 'Book 2',
        pages: 200,
        author_id: author2.id!,
      });

      await Book.objects.create({
        title: 'Book 3',
        pages: 300,
        author_id: author1.id!,
      });

      // Fetch with select_related
      const books = await Book.objects.select_related('author').all();

      expect(books).toHaveLength(3);

      // All authors should be pre-loaded (not promises)
      for (const book of books) {
        const author = await book.author;
        expect(author).not.toBeNull();
        expect(author!.name).toMatch(/Eager Author/);
        expect(author!.email).toMatch(/eager\d@example.com/);
      }

      // Verify specific authors
      expect((await books[0]!.author)!.name).toBe('Eager Author 1');
      expect((await books[1]!.author)!.name).toBe('Eager Author 2');
      expect((await books[2]!.author)!.name).toBe('Eager Author 1');
    });

    it('should handle null foreign keys with select_related', async () => {
      // Create book without author
      await Book.objects.create({
        title: 'Orphan Book',
        pages: 100,
        author_id: null as any,
      });

      // Create author and book
      const author = await Author.objects.create({
        name: 'Has Author',
        email: 'has@example.com',
      });

      await Book.objects.create({
        title: 'Normal Book',
        pages: 200,
        author_id: author.id!,
      });

      // Fetch with select_related
      const books = await Book.objects.select_related('author').all();

      expect(books).toHaveLength(2);

      // First book has no author
      const orphanBook = books.find((b) => b.title === 'Orphan Book');
      expect(orphanBook).toBeDefined();
      expect(orphanBook!.author_id).toBeNull();
      expect(await orphanBook!.author).toBeNull();

      // Second book has author
      const normalBook = books.find((b) => b.title === 'Normal Book');
      expect(normalBook).toBeDefined();
      expect(normalBook!.author_id).toBe(author.id);
      expect((await normalBook!.author)!.name).toBe('Has Author');
    });

    it('should work with filter and select_related', async () => {
      // Create authors
      const author1 = await Author.objects.create({
        name: 'Filter Author 1',
        email: 'filter1@example.com',
      });

      const author2 = await Author.objects.create({
        name: 'Filter Author 2',
        email: 'filter2@example.com',
      });

      // Create books
      await Book.objects.create({
        title: 'Big Book',
        pages: 500,
        author_id: author1.id!,
      });

      await Book.objects.create({
        title: 'Small Book',
        pages: 50,
        author_id: author2.id!,
      });

      // Filter and select_related
      const bigBooks = await Book.objects
        .filter({ pages__gte: 400 })
        .select_related('author')
        .all();

      expect(bigBooks).toHaveLength(1);
      expect(bigBooks[0]!.title).toBe('Big Book');
      expect((await bigBooks[0]!.author)!.name).toBe('Filter Author 1');
    });

    it('should work with ordering and select_related', async () => {
      // Create author
      const author = await Author.objects.create({
        name: 'Order Author',
        email: 'order@example.com',
      });

      // Create books
      await Book.objects.create({
        title: 'C Book',
        pages: 300,
        author_id: author.id!,
      });

      await Book.objects.create({
        title: 'A Book',
        pages: 100,
        author_id: author.id!,
      });

      await Book.objects.create({
        title: 'B Book',
        pages: 200,
        author_id: author.id!,
      });

      // Order by title and select_related
      const books = await Book.objects
        .order_by('title')
        .select_related('author')
        .all();

      expect(books).toHaveLength(3);
      expect(books[0]!.title).toBe('A Book');
      expect(books[1]!.title).toBe('B Book');
      expect(books[2]!.title).toBe('C Book');

      // All should have author loaded
      for (const book of books) {
        const author = await book.author;
        expect(author!.name).toBe('Order Author');
      }
    });

    it('should work with limit/offset and select_related', async () => {
      // Create author
      const author = await Author.objects.create({
        name: 'Pagination Author',
        email: 'pagination@example.com',
      });

      // Create books
      for (let i = 1; i <= 5; i++) {
        await Book.objects.create({
          title: `Book ${i}`,
          pages: i * 100,
          author_id: author.id!,
        });
      }

      // Get page 2 with select_related
      const books = await Book.objects
        .order_by('title')
        .offset(2)
        .limit(2)
        .select_related('author')
        .all();

      expect(books).toHaveLength(2);
      expect(books[0]!.title).toBe('Book 3');
      expect(books[1]!.title).toBe('Book 4');

      // Authors should be loaded
      for (const book of books) {
        const author = await book.author;
        expect(author!.name).toBe('Pagination Author');
      }
    });
  });

  describe('Reverse Relations', () => {
    it('should access reverse relation using default name', async () => {
      // Create author
      const author = await Author.objects.create({
        name: 'Reverse Author',
        email: 'reverse@example.com',
      });

      // Create books
      await Book.objects.create({
        title: 'Book 1',
        pages: 100,
        author_id: author.id!,
      });

      await Book.objects.create({
        title: 'Book 2',
        pages: 200,
        author_id: author.id!,
      });

      // Access reverse relation (default name: book_set)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const books = await (author as any).book_set.all();

      expect(books).toHaveLength(2);
      expect(books[0].title).toMatch(/Book/);
      expect(books[1].title).toMatch(/Book/);
    });

    it('should filter reverse relation results', async () => {
      // Create author
      const author = await Author.objects.create({
        name: 'Filter Reverse Author',
        email: 'filterreverse@example.com',
      });

      // Create books with different pages
      await Book.objects.create({
        title: 'Small Book',
        pages: 50,
        author_id: author.id!,
      });

      await Book.objects.create({
        title: 'Big Book',
        pages: 500,
        author_id: author.id!,
      });

      await Book.objects.create({
        title: 'Medium Book',
        pages: 250,
        author_id: author.id!,
      });

      // Filter reverse relation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bigBooks = await (author as any).book_set
        .filter({ pages__gte: 400 })
        .all();

      expect(bigBooks).toHaveLength(1);
      expect(bigBooks[0].title).toBe('Big Book');
    });

    it('should order reverse relation results', async () => {
      // Create author
      const author = await Author.objects.create({
        name: 'Order Reverse Author',
        email: 'orderreverse@example.com',
      });

      // Create books in random order
      await Book.objects.create({
        title: 'C Book',
        pages: 300,
        author_id: author.id!,
      });

      await Book.objects.create({
        title: 'A Book',
        pages: 100,
        author_id: author.id!,
      });

      await Book.objects.create({
        title: 'B Book',
        pages: 200,
        author_id: author.id!,
      });

      // Order reverse relation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const books = await (author as any).book_set
        .order_by('title')
        .all();

      expect(books).toHaveLength(3);
      expect(books[0].title).toBe('A Book');
      expect(books[1].title).toBe('B Book');
      expect(books[2].title).toBe('C Book');
    });

    it('should handle empty reverse relation', async () => {
      // Create author with no books
      const author = await Author.objects.create({
        name: 'Lonely Author',
        email: 'lonely@example.com',
      });

      // Access reverse relation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const books = await (author as any).book_set.all();

      expect(books).toHaveLength(0);
    });

    it('should throw error when accessing reverse relation on unsaved instance', async () => {
      // Create unsaved author
      const author = new Author({
        name: 'Unsaved Author',
        email: 'unsaved@example.com',
      });

      // Try to access reverse relation
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (author as any).book_set;
      }).toThrow(/Cannot access reverse relation/);
    });

    it('should count reverse relation results', async () => {
      // Create author
      const author = await Author.objects.create({
        name: 'Count Author',
        email: 'count@example.com',
      });

      // Create 5 books
      for (let i = 1; i <= 5; i++) {
        await Book.objects.create({
          title: `Book ${i}`,
          pages: i * 100,
          author_id: author.id!,
        });
      }

      // Count reverse relation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const count = await (author as any).book_set.count();

      expect(count).toBe(5);
    });

    it('should check existence in reverse relation', async () => {
      // Create authors
      const author1 = await Author.objects.create({
        name: 'Has Books Author',
        email: 'hasbooks@example.com',
      });

      const author2 = await Author.objects.create({
        name: 'No Books Author',
        email: 'nobooks@example.com',
      });

      // Create book for author1
      await Book.objects.create({
        title: 'Some Book',
        pages: 100,
        author_id: author1.id!,
      });

      // Check existence
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasBooks = await (author1 as any).book_set.exists();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasNoBooks = await (author2 as any).book_set.exists();

      expect(hasBooks).toBe(true);
      expect(hasNoBooks).toBe(false);
    });
  });

  describe('OneToOne Relationships', () => {
    // Define User and UserProfile models for OneToOne tests
    class User extends Model {
      declare id?: number;
      declare username: string;
      static objects: Manager<User>;
    }

    class UserProfile extends Model {
      declare id?: number;
      declare bio: string;
      declare user_id: number;
      declare user: User | Promise<User> | null;
      static objects: Manager<UserProfile>;
    }

    beforeEach(async () => {
      // Initialize User model
      User.init({
        username: new CharField({ maxLength: 100 }),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (User as any).setAdapter(adapter);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      User.objects = new Manager(User as any, adapter);

      // Initialize UserProfile with OneToOne relation
      UserProfile.init({
        bio: new CharField({ maxLength: 500 }),
        user: new OneToOneField(User, { onDelete: 'CASCADE' }),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (UserProfile as any).setAdapter(adapter);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      UserProfile.objects = new Manager(UserProfile as any, adapter);
    });

    it('should create OneToOne relationship', async () => {
      // Create user
      const user = await User.objects.create({
        username: 'john_doe',
      });

      // Create profile
      const profile = await UserProfile.objects.create({
        bio: 'Software developer',
        user_id: user.id!,
      });

      expect(profile.bio).toBe('Software developer');
      expect(profile.user_id).toBe(user.id);
    });

    it('should lazy load OneToOne relation', async () => {
      // Create user and profile
      const user = await User.objects.create({
        username: 'jane_doe',
      });

      const profile = await UserProfile.objects.create({
        bio: 'Designer',
        user_id: user.id!,
      });

      // Fetch profile
      const fetchedProfile = await UserProfile.objects.get({ id: profile.id });

      // Lazy load user
      const loadedUser = await fetchedProfile.user;

      expect(loadedUser).not.toBeNull();
      expect(loadedUser!.id).toBe(user.id);
      expect(loadedUser!.username).toBe('jane_doe');
    });

    it('should access reverse OneToOne relation (single instance)', async () => {
      // Create user and profile
      const user = await User.objects.create({
        username: 'reverse_user',
      });

      await UserProfile.objects.create({
        bio: 'Reverse test',
        user_id: user.id!,
      });

      // Access reverse relation (should return single instance, not QuerySet)
      // Default name for OneToOne reverse is lowercase model name: 'userprofile'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const profile = await (user as any).userprofile;

      expect(profile).toBeDefined();
      expect(profile.bio).toBe('Reverse test');
      expect(profile.user_id).toBe(user.id);
    });

    it('should return undefined when OneToOne reverse relation does not exist', async () => {
      // Create user without profile
      const user = await User.objects.create({
        username: 'no_profile_user',
      });

      // Access reverse relation (should return undefined)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const profile = await (user as any).userprofile;

      expect(profile).toBeUndefined();
    });

    it('should cache OneToOne reverse relation', async () => {
      // Create user and profile
      const user = await User.objects.create({
        username: 'cache_user',
      });

      await UserProfile.objects.create({
        bio: 'Cache test',
        user_id: user.id!,
      });

      // Load first time
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const profile1 = await (user as any).userprofile;

      // Load second time (should be cached)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const profile2 = await (user as any).userprofile;

      // Should be the same instance
      expect(profile1).toBe(profile2);
    });

    it('should work with select_related for OneToOne', async () => {
      // Create user and profile
      const user = await User.objects.create({
        username: 'eager_user',
      });

      await UserProfile.objects.create({
        bio: 'Eager loading test',
        user_id: user.id!,
      });

      // Fetch with select_related
      const profile = await UserProfile.objects
        .select_related('user')
        .get({ id: 1 });

      // User should be pre-loaded
      const loadedUser = await profile.user;
      expect(loadedUser!.username).toBe('eager_user');
    });
  });
});
