// queryset.ts
import type {BaseModel} from "../model/base-model"
import type {QueryBackend} from "../types";

/**
 * A class representing a queryable set of data related to a specific model.
 * It provides methods to filter, sort, limit, and execute queries against a backend.
 * This class is immutable; all query methods return a new instance.
 *
 * @template T The type of the model this QuerySet operates on.
 * @template F The type of the filter object used in queries.
 */
export class QuerySet<T extends BaseModel, F> {
    /**
     * Represents a constructor for a model class.
     * This variable is assigned a class or constructor function
     * with a single parameter `data` of any type, which returns an instance of type `T`.
     *
     * @type {new (data: any) => T}
     */
    private modelClass: new (data: any) => T
    /**
     * Represents the backend service responsible for handling queries.
     *
     * @typedef {Object} QueryBackend<T, F>
     *
     * @property {T} data - The primary data structure that the backend utilizes or manipulates.
     * @property {F} filters - The filtering options or criteria that can be applied to queries.
     *
     * The QueryBackend type is designed to abstract the management of data and filters for a query handling system.
     */
    private backend: QueryBackend<T, F>
    /**
     * The `filters` variable is an object used to store and manage filtering criteria.
     * It is typed as `F` and initialized as an empty object.
     *
     * This object can be utilized to configure and apply various filters within a program.
     */
    private filters: F = {} as F
    /**
     * Represents an array of strings that holds information about the order of items or elements.
     * This variable can be used to store or manage the sequence in which actions or elements are processed.
     */
    private order: string[] = []
    /**
     * Represents an optional numerical limit for the count of items or iterations.
     * If specified, this value is used to restrict the maximum count allowed.
     * If undefined, no specific limit is applied.
     */
    private limitCount?: number
    /**
     * Represents an optional numeric offset value.
     *
     * This variable can be used to define a count or offset value.
     * Its usage may involve scenarios where a specific adjustment or shift
     * is required, often in contexts like pagination, indexing, or batch processing.
     *
     * If not set, the value is undefined.
     */
    private offsetCount?: number

    /**
     * Constructs an instance of the class.
     *
     * @param {new (data: any) => T} modelClass - The class constructor for the model.
     * @param {QueryBackend<T, F>} backend - The backend instance responsible for query operations.
     * @return {void}
     */
    constructor(modelClass: new (data: any) => T, backend: QueryBackend<T, F>) {
        this.modelClass = modelClass
        this.backend = backend
    }

    /**
     * Creates and returns a new instance of the QuerySet with the same configuration
     * as the current instance, including filters, ordering, limit, and offset.
     *
     * @return {QuerySet<T, F>} A new instance of QuerySet with duplicated configurations.
     */
    protected clone(): QuerySet<T, F> {
        const Ctor = this.constructor as new (
            modelClass: new (data: any) => T,
            backend: QueryBackend<T, F>
        ) => QuerySet<T, F>

        const newInstance = new Ctor(this.modelClass, this.backend)
        newInstance.filters = {...this.filters}
        newInstance.order = [...this.order]
        newInstance.limitCount = this.limitCount
        newInstance.offsetCount = this.offsetCount
        return newInstance
    }

    /**
     * Filters the current QuerySet by applying the specified filters.
     *
     * @param {F} filters - An object containing key-value pairs where the keys
     * represent the fields to filter on and the values represent the filtering criteria.
     * @return {QuerySet<T, F>} A new QuerySet instance with the applied filters.
     */
    filter(filters: F): QuerySet<T, F> {
        const clone = this.clone()
        clone.filters = {...clone.filters, ...filters}
        return clone
    }

    /**
     * Excludes records from the query set based on the specified filters.
     * Modifies the filters to include a "NOT" condition with the provided filters.
     * Returns a new instance of the QuerySet with the updated filters.
     *
     * @param {F} filters - The filter conditions that should be excluded from the result set.
     * @return {QuerySet<T, F>} A new QuerySet instance with the updated exclusion filters applied.
     */
    exclude(filters: F): QuerySet<T, F> {
        const clone = this.clone()
        clone.filters = {...this.filters, NOT: filters}
        return clone
    }

    /**
     * Sorts the results of the query set by the specified fields in ascending order.
     *
     * @param {string[]} fields - The fields by which to order the results. The order of the fields determines the priority of sorting.
     * @return {QuerySet<T, F>} A new query set instance with the specified ordering applied.
     */
    orderBy(...fields: string[]): QuerySet<T, F> {
        const clone = this.clone()
        clone.order = fields
        return clone
    }

    /**
     * Limits the number of records returned by the query to the specified value.
     *
     * @param {number} n - The maximum number of records to return.
     * @return {QuerySet<T, F>} A new QuerySet instance with the specified limit applied.
     */
    limit(n: number): QuerySet<T, F> {
        const clone = this.clone()
        clone.limitCount = n
        return clone
    }

    /**
     * Paginates the query set by applying a limit and an optional offset.
     *
     * @param {Object} params - The pagination parameters.
     * @param {number} params.limit - The maximum number of results to retrieve.
     * @param {number} [params.offset] - The number of results to skip before starting to retrieve.
     * @return {QuerySet<T, F>} A new QuerySet instance with the applied limit and offset.
     */
    paginate({limit, offset}: { limit: number; offset?: number }): QuerySet<T, F> {
        const clone = this.clone()
        clone.limitCount = limit
        clone.offsetCount = offset
        return clone
    }

    /**
     * Executes a backend operation with the specified filters, order, and limit.
     *
     * @return {Promise<T[]>} A promise that resolves to an array of results of type T.
     */
    async execute(): Promise<T[]> {
        return this.backend.execute({
            filters: this.filters,
            order: this.order,
            limit: this.limitCount
        })
    }

    /**
     * Fetches and retrieves all records or items by executing the underlying operation.
     *
     * @return {Promise<T[]>} A promise that resolves to an array of items of type T.
     */
    async all(): Promise<T[]> {
        return this.execute()
    }

    /**
     * Saves the provided instance to the backend storage.
     *
     * @param {T} instance - The instance to be saved.
     * @return {Promise<void>} A promise that resolves when the instance is successfully saved.
     */
    async save(instance: T): Promise<void> {
        return this.backend.save(instance)
    }

    /**
     * Deletes the specified instance from the backend.
     *
     * @param {T} instance - The instance to be deleted.
     * @return {Promise<void>} A promise that resolves when the deletion is complete.
     */
    async delete(instance: T): Promise<void> {
        return this.backend.delete(instance)
    }

    /**
     * Retrieves the first element from the results of a query.
     * Executes a query with a limit of one and returns the first result if available.
     *
     * @return {Promise<T | undefined>} A promise that resolves to the first result if found, or undefined if no results are available.
     */
    async first(): Promise<T | undefined> {
        const results = await this.limit(1).execute()
        return results.length > 0 ? results[0] : undefined
    }

    /**
     * Counts the number of items retrieved from an executed query.
     *
     * @return {Promise<number>} The total count of items as a number.
     */
    async count(): Promise<number> {
        const results = await this.execute()
        return results.length
    }
}