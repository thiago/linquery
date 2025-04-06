import { describe, it, expect, beforeEach, vi } from "vitest"
import { QuerySet } from "../src"
import { BaseModel, type QueryBackend } from "../src"

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