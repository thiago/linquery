/**
 * Type tests for field autocomplete using tsd
 *
 * These tests verify that TypeScript provides proper type inference and autocomplete
 * for filter operations with field lookups.
 *
 * To run these tests: npm run test:types
 */

import { expectType } from 'tsd';
import { Model, CharField, IntegerField, BooleanField, DateTimeField, Manager, QuerySet } from '../../src/core';

// Define a test model
class Book extends Model {
  declare id?: number;
  declare title: string;
  declare author: string;
  declare pages: number;
  declare published: boolean;
  declare publishedDate: Date;
  declare isbn?: string;

  static objects: Manager<Book>;
}

Book.init({
  title: new CharField({ maxLength: 200 }),
  author: new CharField({ maxLength: 100 }),
  pages: new IntegerField(),
  published: new BooleanField({ default: false }),
  publishedDate: new DateTimeField(),
  isbn: new CharField({ maxLength: 20, required: false }),
});

// =============================================================================
// Test: Manager methods return correct types
// =============================================================================

// filter() returns QuerySet<Book>
expectType<QuerySet<Book>>(Book.objects.filter({ title: 'Django' }));
expectType<QuerySet<Book>>(Book.objects.filter({ pages__gte: 200 }));

// exclude() returns QuerySet<Book>
expectType<QuerySet<Book>>(Book.objects.exclude({ published: false }));

// all() returns QuerySet<Book>
expectType<QuerySet<Book>>(Book.objects.all());

// get() returns Promise<Book>
expectType<Promise<Book>>(Book.objects.get({ id: 1 }));

// create() returns Promise<Book>
expectType<Promise<Book>>(Book.objects.create({ title: 'Test', author: 'Test', pages: 100, published: true, publishedDate: new Date() }));

// =============================================================================
// Test: QuerySet chaining
// =============================================================================

const qs = Book.objects.filter({ published: true });

// Chained filter() returns QuerySet<Book>
expectType<QuerySet<Book>>(qs.filter({ pages__gte: 200 }));

// Chained exclude() returns QuerySet<Book>
expectType<QuerySet<Book>>(qs.exclude({ title__contains: 'Draft' }));

// order_by() returns QuerySet<Book>
expectType<QuerySet<Book>>(qs.order_by('title'));
expectType<QuerySet<Book>>(qs.order_by('-pages'));

// limit() returns QuerySet<Book>
expectType<QuerySet<Book>>(qs.limit(10));

// offset() returns QuerySet<Book>
expectType<QuerySet<Book>>(qs.offset(5));

// =============================================================================
// Test: QuerySet terminal methods
// =============================================================================

// all() returns Promise<Book[]>
expectType<Promise<Book[]>>(qs.all());

// toArray() returns Promise<Book[]>
expectType<Promise<Book[]>>(qs.toArray());

// first() returns Promise<Book | undefined>
expectType<Promise<Book | undefined>>(qs.first());

// last() returns Promise<Book | undefined>
expectType<Promise<Book | undefined>>(qs.last());

// count() returns Promise<number>
expectType<Promise<number>>(qs.count());

// exists() returns Promise<boolean>
expectType<Promise<boolean>>(qs.exists());

// get() returns Promise<Book>
expectType<Promise<Book>>(qs.get());

// =============================================================================
// Test: Direct field access is type-safe
// =============================================================================

// Valid field names should be accepted
Book.objects.filter({ title: 'Test' });
Book.objects.filter({ author: 'Test' });
Book.objects.filter({ pages: 100 });
Book.objects.filter({ published: true });
Book.objects.filter({ publishedDate: new Date() });
Book.objects.filter({ isbn: 'test' });

// Multiple fields
Book.objects.filter({
  title: 'Test',
  published: true,
  pages: 100,
});

// =============================================================================
// Test: Lookups work without type errors
// =============================================================================

// String lookups
Book.objects.filter({ title__contains: 'Django' });
Book.objects.filter({ title__icontains: 'django' });
Book.objects.filter({ title__startswith: 'The' });
Book.objects.filter({ title__istartswith: 'the' });
Book.objects.filter({ title__endswith: 'Book' });
Book.objects.filter({ title__iendswith: 'book' });
Book.objects.filter({ title__exact: 'Django' });
Book.objects.filter({ title__iexact: 'django' });

// Number lookups
Book.objects.filter({ pages__gt: 200 });
Book.objects.filter({ pages__gte: 200 });
Book.objects.filter({ pages__lt: 500 });
Book.objects.filter({ pages__lte: 500 });
Book.objects.filter({ pages__in: [100, 200, 300] });
Book.objects.filter({ pages__range: [100, 500] });

// Boolean lookups
Book.objects.filter({ published__exact: true });

// Date lookups
Book.objects.filter({ publishedDate__year: 2024 });
Book.objects.filter({ publishedDate__month: 1 });
Book.objects.filter({ publishedDate__day: 15 });
Book.objects.filter({ publishedDate__gt: new Date('2024-01-01') });
Book.objects.filter({ publishedDate__gte: new Date('2024-01-01') });
Book.objects.filter({ publishedDate__lt: new Date('2024-12-31') });
Book.objects.filter({ publishedDate__lte: new Date('2024-12-31') });

// Null lookups
Book.objects.filter({ isbn__isnull: true });
Book.objects.filter({ isbn__isnull: false });

// =============================================================================
// Test: Manager CRUD methods
// =============================================================================

// getOrCreate returns correct type
expectType<Promise<{ instance: Book; created: boolean }>>(
  Book.objects.getOrCreate({ isbn: 'test' }, { title: 'New' })
);

// updateOrCreate returns correct type
expectType<Promise<{ instance: Book; created: boolean }>>(
  Book.objects.updateOrCreate({ isbn: 'test' }, { title: 'Updated' })
);

// update returns number
expectType<Promise<number>>(
  Book.objects.update({ published: false }, { published: true })
);

// delete returns number
expectType<Promise<number>>(
  Book.objects.delete({ published: false })
);

// count returns number
expectType<Promise<number>>(Book.objects.count());

// exists returns boolean
expectType<Promise<boolean>>(Book.objects.exists());

// first returns Book | undefined
expectType<Promise<Book | undefined>>(Book.objects.first());

// last returns Book | undefined
expectType<Promise<Book | undefined>>(Book.objects.last());
