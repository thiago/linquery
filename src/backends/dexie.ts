import type {Dexie, Table, Version} from "dexie"
import type {Model} from "../model"
import {Filter, QueryBackend, ModelClass, ExecuteOptions, Ordering} from "../types"
import {filterLookup} from "../filter-lookup"

export const DEFAULT_DEXIE_DATABASE_KEY = "&id"

export interface DexieBackendOptions {
    db: Dexie
    version: number
    key?: string
    tableName: string
    indexes?: string[]
}


export class DexieBackend<T extends Model, F extends Filter> implements QueryBackend<T, F> {
    private table: Table<any, string>
    private db: Dexie
    private store: Version

    constructor(
        private modelClass: ModelClass<T>,
        private options: DexieBackendOptions
    ) {
        this.db = options.db
        const indexDef = options.indexes?.length ? "," + options.indexes.join(",") : ""
        this.store = this.db.version(options.version).stores({[options.tableName]: `${options.key || DEFAULT_DEXIE_DATABASE_KEY}${indexDef}`})
        this.table = this.db.table(options.tableName)
    }

    async execute({filters = {} as F, ordering = [], pagination}: ExecuteOptions<F>): Promise<T[]> {
        let collection = this.table.toCollection().filter((item: T) => filterLookup(item, filters))

        if (pagination?.offset) {
            collection = collection.offset(pagination.offset)
        }

        if (pagination?.limit) {
            collection = collection.limit(pagination.limit)
        }

        let results = await collection.toArray()

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

        return results.map(data => this.modelClass.new(data))
    }

    async save(instance: T): Promise<void> {
        await this.table.put(instance)
    }

    async delete(instance: T): Promise<void> {
        const pk = instance.getPk()
        if (!pk) return
        await this.table.delete(pk)
    }
}


// dexie-filter-lookup.ts
