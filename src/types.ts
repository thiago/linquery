import type {BaseModel, Model, NestedModel} from "./model";
import type {QuerySet} from "./queryset";
import type {ModelRegistry} from "./registry"
import type {SignalRegistry} from "./signals"

export type BaseModelClass<T extends BaseModel> = {
    new(data?: Partial<T>): T
    new(data?: any): T
    new: (data: Partial<T>) => T
    fullClean(): Promise<void>
    getFields(): Record<string, Field>
} & typeof BaseModel

export type ModelClass<T extends Model> = {
    new(data?: Partial<T>): T
    new(data?: any): T
    new: (data: Partial<T>) => T

    getFields(): Record<string, Field>
    getSchema(): Record<string, (value: any) => any>

    objects: QuerySet<T, any>
    pkField?: string
    fields?: Record<string, Field>
    registry?: ModelRegistry
    signals?: SignalRegistry
} & typeof BaseModel & typeof Model

export type NestedModelClass<T extends NestedModel> = {
    new(data?: Partial<T>): T
    new(data?: any): T
    new: (data: Partial<T>) => T
    getFields(): Record<string, Field>
    getSchema(): Record<string, (value: any) => any>
} & typeof BaseModel & typeof NestedModel


export interface ExecuteOptions<F> {
    filters?: F
    order?: string[]
    limit?: number
    offset?: number
    only?: string[]
    selectRelated?: string[]                         // one-to-one or FK
    prefetchRelated?: string[]                       // one-to-many or m2m
    /**
     * Related querysets indexed by field name, used for resolving select_related and prefetch_related.
     * Each key represents the related field (e.g., "group" or "tags"), and the value is a QuerySet already prepared with filters.
     */
    relatedQuerySets?: Record<string, QuerySet<any, any>>
}

export interface QueryBackend<T extends Model, F> {
    execute(query: ExecuteOptions<F>): Promise<T[]>

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

export enum FieldTypeEnum {
    String = "string",
    Number = "number",
    Boolean = "boolean",
    Date = "date",
    Relation = "relation",
    Email = "email",
    Enum = "enum",
    JSON = "json",
    Nested = "nested",
}

export type FieldType = FieldTypeEnum | (string & {})

export type Field<T = any> = {
    type: FieldType
    required?: boolean
    default?: T
    label?: string
    description?: string
    enum?: T[]
    model?: string | ModelClass<any> | BaseModelClass<any> | NestedModelClass<any>
    reverseName?: string
    toInternal?: (value: any) => T
    toExternal?: (value: T) => any
    validator?: (value: T) => void
}

export type EnumLike = Record<string, string | number>
export type EnumValues<T extends EnumLike> = T[keyof T]