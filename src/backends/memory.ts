import type { QueryBackend } from "../types"
import type { BaseModel } from "../model/base-model"
import { match } from "../queryset/match"

interface MemoryBackendOptions {
  autoGeneratePk?: boolean
  generateFn?: () => string
}

export class MemoryBackend<T extends BaseModel, F> implements QueryBackend<T, F> {
  private data: Map<string, T> = new Map()
  private options: MemoryBackendOptions

  constructor(options: MemoryBackendOptions = {autoGeneratePk: true}) {
    this.options = options
  }

  async execute({
    filters,
    order = [],
    limit,
    offset
  }: {
    filters?: F
    order?: string[]
    limit?: number
    offset?: number
  }): Promise<T[]> {
    let results = Array.from(this.data.values()).filter(item =>
      filters ? match(item, filters) : true
    )

    if (order.length > 0) {
      results = results.sort((a: any, b: any) => {
        for (const key of order) {
          const dir = key.startsWith("-") ? -1 : 1
          const field = key.replace(/^-/, "")
          const cmp = a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0
          if (cmp !== 0) return cmp * dir
        }
        return 0
      })
    }

    if (offset !== undefined) {
      results = results.slice(offset)
    }

    if (limit !== undefined) {
      results = results.slice(0, limit)
    }

    return results
  }

  async save(instance: T): Promise<void> {
    const modelClass = instance.constructor as typeof BaseModel
    const pkField = modelClass.pkField ?? "id"
    let pk = instance.getPk()

    if (!pk && this.options.autoGeneratePk) {
      (instance as any)[pkField] = this.options.generateFn?.() ?? crypto.randomUUID()
      pk = (instance as any)[pkField]
    }

    if (!pk) {
      throw new Error("Instance must have a primary key to be saved in memory backend.")
    }

    this.data.set(pk, instance)
  }

  async delete(instance: T): Promise<void> {
    const pk = instance.getPk()
    if (!pk) return
    this.data.delete(pk)
  }

  clear(): void {
    this.data.clear()
  }

  preload(items: T[]): void {
    for (const item of items) {
      const pk = item.getPk()
      if (pk) this.data.set(pk, item)
    }
  }

  all(): T[] {
    return Array.from(this.data.values())
  }
}
