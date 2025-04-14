import type {BaseModel, Model, NestedModel} from "./model";
import type {QuerySet} from "./queryset";
import type {ModelRegistry} from "./registry"
import type {SignalRegistry} from "./signals"

export type Constructor<T = {}> = abstract new (...args: any[]) => T

export type BaseModelClass<T extends BaseModel = BaseModel> =
    Constructor<T> &
    typeof BaseModel & {
    getFields(): Record<string, Field>
    fullClean(): Promise<void>
}

export type ModelClassConstructor<T extends Model> = new(data?: Partial<T>) => T

export type ModelClass<T extends Model> = {
    new(data?: Partial<T>): T
    new(data?: any): T
    new: (data: Partial<T>) => T

    getFields(): Record<string, Field>
    getSchema(): Record<string, (value: any) => any>

    objects: QuerySet<T, any>
    pkField: string
    fields?: Record<string, Field>
    registry: ModelRegistry
    signals: SignalRegistry
} & typeof BaseModel & typeof Model


export type NestedModelClass<T extends NestedModel> = {
    new(data?: Partial<T>): T
    new(data?: any): T
    new: (data: Partial<T>) => T
    getFields(): Record<string, Field>
    getSchema(): Record<string, (value: any) => any>
} & typeof BaseModel & typeof NestedModel

export enum Ordering {
    ASC = 'ASC',
    DESC = 'DESC',
}

export type OrderBy = {
    field: string
    direction?: Ordering | keyof typeof Ordering
}

export type Pagination = {
    limit?: number
    offset?: number
    after?: string
    before?: string
}

export interface ExecuteOptions<F> {
    filters?: F
    ordering?: OrderBy[]
    pagination?: Pagination
    only?: string[]
    selectRelated?: string[]
    prefetchRelated?: Record<string, RelatedPrefetchOptions | boolean>
    /**
     * Related querysets indexed by field name, used for resolving select_related and prefetch_related.
     * Each key represents the related field (e.g., "group" or "tags"), and the value is a QuerySet already prepared with filters.
     */
    relatedQuerySets?: Record<string, QuerySet<any, any>>
}

export interface RelatedPrefetchOptions {
    filters?: Filter<any>
    exclude?: Filter<any>
    only?: string[]
    ordering?: OrderBy[]
    pagination?: Pagination
}

export type RelatedPrefetchConfig = true | RelatedPrefetchOptions

export type RelatedPrefetchMap = {
    [fieldName: string]: RelatedPrefetchConfig
}

export type PrefetchInput = (string | RelatedPrefetchMap)[]

export interface QueryBackend<T extends Model, F> {
    execute(query: ExecuteOptions<F>): Promise<T[]>

    save(instance: T): Promise<void>

    delete(instance: T): Promise<void>
}

export enum FieldTypeEnum {
    String = "string",
    Number = "number",
    Boolean = "boolean",
    Date = "date",
    Email = "email",
    Enum = "enum",
    JSON = "json",
    Relation = "relation",        // One-to-one ou FK
    Reverse = "reverse",          // One-to-many reverse
    ManyToMany = "manyToMany",    // Many-to-many
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
    relatedName?: string
    toInternal?: (value: any) => T
    toExternal?: (value: T) => any
    validator?: (value: T) => void
    schema?: any
}

export type EnumLike = Record<string, string | number>
export type EnumValues<T extends EnumLike> = T[keyof T]


/**
 * Filters
 */
// Core lookup interfaces for individual fields
export interface BaseFilterLookup<T> {
    exact?: T
    isNull?: boolean
    inList?: T[]
}

export interface RangeFilterLookup<T> {
    start?: T
    end?: T
}

export interface ComparisonFilterLookup<T> extends BaseFilterLookup<T> {
    gt?: T
    gte?: T
    lt?: T
    lte?: T
    range?: RangeFilterLookup<T>
}

export interface StringFilterLookup extends BaseFilterLookup<string> {
    contains?: string
    iContains?: string
    startsWith?: string
    iStartsWith?: string
    endsWith?: string
    iEndsWith?: string
    regex?: string
    iRegex?: string
}

export interface DateFilterLookup extends ComparisonFilterLookup<string> {
    year?: ComparisonFilterLookup<number>
    month?: ComparisonFilterLookup<number>
    day?: ComparisonFilterLookup<number>
    weekDay?: ComparisonFilterLookup<number>
    isoWeekDay?: ComparisonFilterLookup<number>
    week?: ComparisonFilterLookup<number>
    isoYear?: ComparisonFilterLookup<number>
    quarter?: ComparisonFilterLookup<number>
}

export interface TimeFilterLookup extends ComparisonFilterLookup<string> {
    hour?: ComparisonFilterLookup<number>
    minute?: ComparisonFilterLookup<number>
    second?: ComparisonFilterLookup<number>
}

export interface DateTimeFilterLookup extends DateFilterLookup, TimeFilterLookup {
}

export interface GenericFilterLookup<T> extends BaseFilterLookup<T> {
}

type FilterFor<T> =
    | T // valor direto, tratado como `{ exact: T }`
    | (T extends string
    ? StringFilterLookup
    : T extends number
        ? ComparisonFilterLookup<T>
        : T extends boolean
            ? BaseFilterLookup<T>
            : T extends Date
                ? DateTimeFilterLookup
                : GenericFilterLookup<T>) // fallback

// Logical operators + field filters
export type Filter<T = any> = {
    AND?: Filter<T>
    OR?: Filter<T>
    NOT?: Filter<T>
} & {
    [K in keyof T]?: FilterFor<T[K]>
}