/**
 * Basic Usage Example
 *
 * This example demonstrates the core features of Linquery:
 * - Model definition
 * - CRUD operations
 * - QuerySet filtering and ordering
 */

import { Model, Manager, CharField, IntegerField, BooleanField } from '../src/core';

import { MemoryAdapter } from '../src/adapters';

// Create adapter
const adapter = new MemoryAdapter();

// Define your model
class Book extends Model {
  declare id?: number;
  declare title: string;
  declare author: string;
  declare pages: number;
  declare published: boolean;

  static objects: Manager<Book>;
}

// Initialize the model with field definitions
Book.init({
  title: new CharField({ maxLength: 200 }),
  author: new CharField({ maxLength: 100 }),
  pages: new IntegerField({ min: 1 }),
  published: new BooleanField({ default: false }),
});

// Set adapter and manager
(Book as any).setAdapter(adapter);
Book.objects = new Manager<Book>(Book, adapter);

Book.objects.filter({ title: 'sdf' });

async function main() {
  await adapter.connect();

  console.log('=== Linquery Basic Usage Example ===\n');

  // Create records
  console.log('1. Creating books...');
  const book1 = await Book.objects.create({
    title: 'The TypeScript Handbook',
    author: 'Microsoft',
    pages: 350,
    published: true,
  });

  const book2 = await Book.objects.create({
    title: 'Learning GraphQL',
    author: 'Eve Porcello',
    pages: 280,
    published: true,
  });

  const book3 = await Book.objects.create({
    title: 'Advanced TypeScript',
    author: 'John Doe',
    pages: 420,
    published: false,
  });

  console.log(`Created ${book1.title}`);
  console.log(`Created ${book2.title}`);
  console.log(`Created ${book3.title}\n`);

  // Get all books
  console.log('2. Getting all books:');
  const allBooks = await Book.objects.all().toArray();
  console.log(`Total books: ${allBooks.length}\n`);

  // Filter by published status
  console.log('3. Filtering published books:');
  const publishedBooks = await Book.objects.filter({ published: true }).toArray();

  publishedBooks.forEach((book) => {
    console.log(`- ${book.title} by ${book.author}`);
  });
  console.log();

  // Filter with lookups
  console.log('4. Books with 300+ pages:');
  const longBooks = await Book.objects.filter({ pages__gte: 300 }).toArray();

  longBooks.forEach((book) => {
    console.log(`- ${book.title} (${book.pages} pages)`);
  });
  console.log();

  // Ordering
  console.log('5. Books ordered by pages (descending):');
  const orderedBooks = await Book.objects.order_by('-pages').toArray();

  orderedBooks.forEach((book) => {
    console.log(`- ${book.title}: ${book.pages} pages`);
  });
  console.log();

  // Chaining filters
  console.log('6. Published books with 250+ pages:');
  const filteredBooks = await Book.objects
    .filter({ published: true })
    .filter({ pages__gte: 250 })
    .order_by('title')
    .toArray();

  filteredBooks.forEach((book) => {
    console.log(`- ${book.title}`);
  });
  console.log();

  // Get single record
  console.log('7. Getting single book:');
  try {
    const book = await Book.objects.get({ title: 'Learning GraphQL' });
    console.log(`Found: ${book.title} by ${book.author}\n`);
  } catch (error) {
    console.log('Book not found\n');
  }

  // Count
  console.log('8. Counting records:');
  const totalCount = await Book.objects.count();
  const publishedCount = await Book.objects.filter({ published: true }).count();

  console.log(`Total books: ${totalCount}`);
  console.log(`Published books: ${publishedCount}\n`);

  // Exists
  console.log('9. Checking existence:');
  const hasDraftBooks = await Book.objects.filter({ published: false }).exists();

  console.log(`Has draft books: ${hasDraftBooks}\n`);

  // Update
  console.log('10. Updating a book:');
  book3.published = true;
  await book3.save();
  console.log(`Updated: ${book3.title} is now published\n`);

  // Bulk update
  console.log('11. Bulk update:');
  const updated = await Book.objects
    .filter({ author: 'Microsoft' })
    .update({ author: 'Microsoft Corporation' });

  console.log(`Updated ${updated} books\n`);

  // Delete
  console.log('12. Deleting a book:');
  await book3.delete();
  console.log(`Deleted: ${book3.title}\n`);

  // Final count
  const finalCount = await Book.objects.count();
  console.log(`Final count: ${finalCount} books`);

  await adapter.disconnect();
}

// Run example
main().catch(console.error);
