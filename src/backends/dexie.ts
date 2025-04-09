import type {Dexie, Table, Version} from "dexie"
import type {Model} from "../model"
import {QuerySet} from "../queryset"
import type {Filter, FilterLookup, QueryBackend, ModelClass} from "../types"
import {match} from "../match"

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

    async execute({filters = {} as F, order = [], limit, offset}: {
        filters?: F
        order?: string[]
        limit?: number
        offset?: number
    }): Promise<T[]> {
        let collection = this.table.toCollection().filter((item: T) => match(item, filters))

        if (offset) {
            collection = collection.offset(offset)
        }

        if (limit !== undefined) {
            collection = collection.limit(limit)
        }

        let results = await collection.toArray()

        if (order.length > 0) {
            results = results.sort((a: any, b: any) => {
                for (const key of order) {
                    const dir = key.startsWith("-") ? -1 : 1
                    const k = key.replace(/^-/, "")
                    const cmp = a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0
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


// dexie-match.ts
