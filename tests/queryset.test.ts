import {beforeEach, describe, expect, it, vi} from "vitest"
import {BaseModel, type QueryBackend, QuerySet} from "../src"

import {MemoryBackend} from "../src/backends/memory"
import {DoesNotExist, MultipleObjectsReturned} from "../src/errors"

class TestModel extends BaseModel {
  id!: string
  name!: string
}

type TestFilter = { name?: string; NOT?: any }

const createMockBackend = (): QueryBackend<TestModel, TestFilter> => ({
  execute: vi.fn(async () => []),
  save: vi.fn(),
  delete: vi.fn(),
})

describe("QuerySet", () => {
  let backend: QueryBackend<TestModel, TestFilter>
  let queryset: QuerySet<TestModel, TestFilter>

  beforeEach(() => {
    backend = createMockBackend()
    queryset = new QuerySet(TestModel, backend)
  })

  it("clones filters correctly", () => {
    const filtered = queryset.filter({ name: "John" })
    expect(filtered).not.toBe(queryset)
    expect((filtered as any).filters).toEqual({ name: "John" })
  })

  it("supports exclude", () => {
    const excluded = queryset.exclude({ name: "Doe" })
    expect((excluded as any).filters).toEqual({ NOT: { name: "Doe" } })
  })

  it("supports orderBy", () => {
    const ordered = queryset.orderBy("-name")
    expect((ordered as any).order).toEqual(["-name"])
  })

  it("applies limit and offset via paginate", () => {
    const paginated = queryset.paginate({ limit: 10, offset: 5 })
    expect((paginated as any).limitCount).toBe(10)
    expect((paginated as any).offsetCount).toBe(5)
  })

  it("calls backend.execute with correct params", async () => {
    await queryset.filter({ name: "Alice" }).orderBy("name").limit(5).execute()
    expect(backend.execute).toHaveBeenCalledWith({
      filters: { name: "Alice" },
      order: ["name"],
      limit: 5,
      offset: undefined,
      only: undefined,
      prefetchRelated: undefined,
      selectRelated: undefined,
      relatedQuerySets: {}
    })
  })

  it("calls backend.save", async () => {
    const item = new TestModel({ id: "1", name: "SaveTest" })
    await queryset.save(item)
    expect(backend.save).toHaveBeenCalledWith(item)
  })

  it("calls backend.delete", async () => {
    const item = new TestModel({ id: "2", name: "DeleteTest" })
    await queryset.delete(item)
    expect(backend.delete).toHaveBeenCalledWith(item)
  })

  it("returns first item if available", async () => {
    const mockItem = new TestModel({ id: "3", name: "First" })
    backend.execute = vi.fn(async () => [mockItem])
    const result = await queryset.first()
    expect(result).toEqual(mockItem)
  })

  it("returns undefined if first has no result", async () => {
    backend.execute = vi.fn(async () => [])
    const result = await queryset.first()
    expect(result).toBeUndefined()
  })

  it("counts the number of results", async () => {
    backend.execute = vi.fn(async () => [1, 2, 3].map(i => new TestModel({ id: `${i}`, name: `Item${i}` })))
    const result = await queryset.count()
    expect(result).toBe(3)
  })
})


class Book extends BaseModel {
    id!: string
    title!: string
    author!: string
    pages!: number
    static fields = {
        id: {type: "string"},
        title: {type: "string"},
        author: {type: "string"},
        pages: {type: "number"}
    }
    static backend = new MemoryBackend<Book, Partial<Book>>()
    static objects = new QuerySet(Book, Book.backend)
}

describe("QuerySet.valuesList", () => {
    beforeEach(() => {
        Book.backend.clear()
    })

    it("returns flat list for single field with flat option", async () => {
        await Book.objects.save(Book.new({id: "1", title: "Title 1", author: "A", pages: 100}))
        await Book.objects.save(Book.new({id: "2", title: "Title 2", author: "B", pages: 200}))

        const result = await Book.objects.valuesList("id", {flat: true}).execute()
        expect(result).toEqual(["1", "2"])
    })

    it("returns nested list for single field without flat", async () => {
        await Book.objects.save(Book.new({id: "1", title: "Title 1", author: "A", pages: 100}))

        const result = await Book.objects.valuesList("id").execute()
        expect(result).toEqual([["1"]])
    })

    it("returns nested list for multiple fields", async () => {
        await Book.objects.save(Book.new({id: "1", title: "Title 1", author: "A", pages: 100}))
        await Book.objects.save(Book.new({id: "2", title: "Title 2", author: "B", pages: 200}))

        const result = await Book.objects.valuesList("id", "title").execute()
        expect(result).toEqual([
            ["1", "Title 1"],
            ["2", "Title 2"]
        ])
    })

    it("ignores flat when multiple fields are passed", async () => {
        await Book.objects.save(Book.new({id: "1", title: "Title 1", author: "A", pages: 100}))

        const result = await Book.objects.valuesList("id", "title", {flat: true} as any).execute()
        expect(result).toEqual([["1", "Title 1"]])
    })
})

describe("QuerySet.get", () => {
    beforeEach(() => {
        Book.backend.clear()
    })

    it("returns single object matching the filter", async () => {
        await Book.objects.save(Book.new({id: "1", title: "One", author: "A", pages: 100}))
        const book = await Book.objects.get({id: "1"})
        expect(book).toBeInstanceOf(Book)
        expect(book.title).toBe("One")
    })

    it("throws DoesNotExist if no match", async () => {
        await expect(Book.objects.get({id: "missing"})).rejects.toThrow(DoesNotExist)
    })

    it("throws MultipleObjectsReturned if more than one match", async () => {
        await Book.objects.save(Book.new({id: "1", title: "One", author: "A", pages: 100}))
        await Book.objects.save(Book.new({id: "2", title: "One", author: "B", pages: 200}))

        await expect(Book.objects.get({title: "One"})).rejects.toThrow(MultipleObjectsReturned)
    })
})