import {ExecuteOptions, FieldTypeEnum, ModelClass, ModelClassConstructor, Ordering, QueryBackend} from "../types"
import type {Model} from "../model"
import {filterLookup} from "../filter-lookup"

export interface MemoryStorage<T> {
    load(): Promise<Map<any, T>>

    delete(key: any): Promise<void>

    save(data: Map<any, T>): Promise<void>
}

export class InMemoryStorage<T> implements MemoryStorage<T> {
    private data: Map<any, T> = new Map()

    async load(): Promise<Map<any, T>> {
        return new Map(this.data)
    }

    async save(data: Map<any, T>): Promise<void> {
        this.data = new Map(data)
    }

    async delete(key: any): Promise<void> {
        this.data.delete(key)
    }

    clear() {
        this.data.clear()
    }
}

export class LocalStorageStorage<T extends Model> implements MemoryStorage<T> {
    constructor(private key: string) {
    }

    async load(): Promise<Map<any, T>> {
        const raw = localStorage.getItem(this.key)
        const parsed = raw ? JSON.parse(raw) : {}
        return new Map(Object.entries(parsed))
    }

    async save(data: Map<any, T>): Promise<void> {
        const plain: Record<any, any> = {}
        for (const [key, value] of data.entries()) {
            plain[key] = value
        }
        localStorage.setItem(this.key, JSON.stringify(plain))
    }

    async delete(key: any): Promise<void> {
        const data = await this.load()
        data.delete(key)
        localStorage.setItem(this.key, JSON.stringify(data))
    }
}

interface MemoryBackendOptions {
    autoGeneratePk?: boolean
    generateFn?: () => string
}

export class MemoryBackend<T extends Model, F> implements QueryBackend<T, F> {
    private modelClass: ModelClass<T>
    private storage: MemoryStorage<T>
    private options: MemoryBackendOptions

    constructor(
        modelClass: ModelClassConstructor<T>,
        storage: MemoryStorage<T> = new InMemoryStorage<T>(),
        options: MemoryBackendOptions = {autoGeneratePk: true},
    ) {
        this.modelClass = modelClass as ModelClass<T>
        this.storage = storage
        this.options = options
    }

    async execute({
                      filters,
                      ordering = [],
                      pagination,
                      selectRelated = [],
                      prefetchRelated = {},
                      relatedQuerySets = {},
                  }: ExecuteOptions<F>): Promise<T[]> {
        const map = await this.storage.load()
        const allData = Array.from(map.values())

        // Filter
        let results = filters ? allData.filter(item => filterLookup(item, filters)) : allData

        // Order
        if (ordering.length > 0) {
            results.sort((a: any, b: any) => {
                for (const key of ordering) {
                    const dir = key.direction === Ordering.DESC ? -1 : 1
                    const cmp = a[key.field] > b[key.field] ? 1 : a[key.field] < b[key.field] ? -1 : 0
                    if (cmp !== 0) return cmp * dir
                }
                return 0
            })
        }

        // Pagination
        if (pagination?.offset !== undefined) results = results.slice(pagination.offset)
        if (pagination?.limit !== undefined) results = results.slice(0, pagination.limit)

        // Select Related
        const relatedPromises: Promise<void>[] = []

        for (const item of results) {
            for (const fieldName of selectRelated ?? []) {
                const qs = relatedQuerySets[fieldName]
                if (!qs) continue

                const field = this.modelClass.getFields?.()[fieldName]
                if (!field || field.type !== FieldTypeEnum.Relation || !field.model) continue

                const relatedModel = typeof field.model === "string"
                    ? this.modelClass.registry.get(field.model)
                    : field.model as ModelClass<any>

                const id = (item as any)[fieldName]
                if (!id || !relatedModel) continue

                relatedPromises.push(
                    qs.filter({[relatedModel.pkField!]: id}).first().then(relatedInstance => {
                        if (relatedInstance) {
                            (item as any)[fieldName] = relatedInstance
                        }
                    })
                )
            }
        }
        // Select Related
        for (const [fieldName, options] of Object.entries(prefetchRelated)) {
            const qs = relatedQuerySets[fieldName]
            if (!qs) continue

            const field = this.modelClass.getFields?.()[fieldName]
            if (!field) continue

            const isReverse = field.type === FieldTypeEnum.Reverse
            const isManyToMany = field.type === FieldTypeEnum.ManyToMany

            if (!isReverse && !isManyToMany) continue

            for (const item of results) {
                const filters: Record<string, any> = {}

                if (isReverse) {
                    const parentKey = `${this.modelClass.name.charAt(0).toLowerCase()}${this.modelClass.name.slice(1)}.id`
                    filters[parentKey] = item.getPk()
                }

                if (isManyToMany) {
                    const relatedModel = typeof field.model === "string"
                        ? this.modelClass.registry.get(field.model)
                        : field.model as ModelClass<any>

                    const relatedItems = (item as any)[fieldName]
                    const relatedPk = relatedModel?.pkField

                    if (!relatedItems || !relatedPk) continue

                    filters[relatedPk] = {
                        in: relatedItems.map((rel: any) => rel[relatedPk]),
                    }
                }

                relatedPromises.push(
                    qs.filter(filters).execute().then(relatedItems => {
                        Object.defineProperty(item, fieldName, {
                            value: relatedItems,
                            enumerable: true,
                            writable: true,
                        })
                    })
                )
            }
        }
        if (relatedPromises.length > 0) await Promise.all(relatedPromises)

        return results
    }

    async save(instance: T): Promise<void> {
        const map = await this.storage.load()
        const modelClass = instance.constructor as typeof Model
        const pkField = modelClass.pkField ?? "id"
        let pk = instance.getPk()

        if (!pk && this.options.autoGeneratePk) {
            (instance as any)[pkField] = this.options.generateFn?.() ?? crypto.randomUUID()
            pk = (instance as any)[pkField]
        }

        if (!pk) throw new Error("Missing primary key")

        map.set(pk, instance)
        await this.storage.save(map)
    }

    async delete(instance: T): Promise<void> {
        await this.storage.delete(instance.getPk())
    }

    async preload(items: T[]): Promise<void> {
        const map = new Map<string, T>()
        for (const item of items) {
            const pk = item.getPk()
            if (pk) map.set(pk, item)
        }
        await this.storage.save(map)
    }

    async all(): Promise<T[]> {
        const map = await this.storage.load()
        return Array.from(map.values())
    }

    async clear(): Promise<void> {
        await this.storage.save(new Map())
    }
}
