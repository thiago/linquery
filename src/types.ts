import type {BaseModel} from "./model/base-model";

export type ModelClass<T extends BaseModel> = {
    new(data: Partial<T>): T
    new(data?: any): T
    new: (data: Partial<T>) => T
} & typeof BaseModel


export interface QueryBackend<T extends BaseModel, F> {
    execute(query: {
        filters?: F
        order?: string[]
        limit?: number
    }): Promise<T[]>

    save(instance: T): Promise<void>

    delete(instance: T): Promise<void>
}

export enum Ordering {
    Asc = 'ASC',
    Desc = 'DESC',
}

export type FilterRangeLookup<T = any> = {
    start: T
    end: T
}

export type FilterLookup<T = any> = {
    eq?: T
    ne?: T
    gte?: T
    gt?: T
    lt?: T
    lte?: T
    contains?: T
    iContains?: T
    startsWith?: T
    iStartsWith?: T
    endsWith?: T
    iEndsWith?: T
    exact?: T
    iExact?: T
    in?: T[]
    notIn?: T[]
    range?: FilterRangeLookup<T>
    is?: boolean
    isNull?: boolean
    exists?: boolean
    length?: number | FilterLookup<number>
}

export type Filter<T = any> = {
    [K in keyof T]?: T[K]
}

export type FilterWithLookups<T = any> = {
    [K in keyof T]?: T[K] | FilterLookup<T[K]>
}

export type FilterLogical<T = any> = {
    AND?: FilterLogical<T>
    OR?: FilterLogical<T>
    NOT?: FilterLogical<T>
} & FilterWithLookups<T>
