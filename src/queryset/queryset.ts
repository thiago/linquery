import type {BaseModel} from "../model/base-model"
import type {ExecuteOptions, ModelClass, QueryBackend} from "../types";
import {DoesNotExist, MultipleObjectsReturned} from "../errors"

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
     * Represents a generic class or constructor for creating model instances.
     *
     * @template T
     * @type {ModelClass<T>}
     */
    private modelClass: ModelClass<T>

    /**
     * Represents the backend configuration for querying data.
     *
     * @template T - The type of data being queried.
     * @template F - The type of filters applied during querying.
     */
    private backend: QueryBackend<T, F>
    /**
     * Represents a collection of filters used to manipulate or query data.
     * The `filters` variable is defined as an object of type `F`.
     *
     * This object can be used to store specific filtering criteria or
     * configurations that determine a subset of data based on a set of rules.
     */
    private filters: F = {} as F
    /**
     * Represents an array containing the order of elements or items.
     * This variable is used to maintain and manage the sequence in which items are stored or processed.
     */
    private order: string[] = []
    /**
     * Represents an optional numeric value that specifies the limit or maximum count allowed.
     * It determines the upper boundary for a certain operation or process.
     * If not provided, no specific limit may be enforced.
     */
    private limitCount?: number
    /**
     * Represents the numerical offset used for calculations or adjustments.
     * It is an optional property and can be undefined.
     * If provided, it should be a number indicating the offset value.
     */
    private offsetCount?: number
    /**
     * An optional array of strings that specifies field names.
     * This variable is typically used to denote a subset of specific fields
     * to be included in an operation or output.
     * If undefined or null, no field filtering is applied.
     */
    private onlyFields?: string[]
    /**
     * An optional array of strings specifying the related fields to be selected.
     * Each string in the array represents the name of a related field.
     * Use this property to include additional related fields in a query or operation.
     *
     * @typedef {string[]} selectRelatedFields
     */
    private selectRelatedFields?: string[]
    /**
     * Specifies an optional list of related fields to be prefetched.
     *
     * When provided, this array indicates the fields that should be fetched
     * in advance to optimize data retrieval and reduce subsequent requests.
     * Typically used in scenarios where related data is likely needed shortly
     * after the initial load.
     *
     * @typedef {string[]} prefetchRelatedFields
     *   Array of field names to be prefetched.
     */
    private prefetchRelatedFields?: string[]
    /**
     * Represents an optional record object that maps string keys to QuerySet instances.
     * Each key in the record corresponds to a related query set associated with a specific entity or context.
     *
     * This structure is typically used to maintain and manage multiple related query sets for
     * handling complex data retrieval operations within an application.
     *
     * @typedef {Object} relatedQuerySets
     * @property {Record<string, QuerySet<any, any>>} [relatedQuerySets] - An optional record of query sets,
     * where the key is a string, and the value is a QuerySet instance capable of handling queries.
     */
    private relatedQuerySets?: Record<string, QuerySet<any, any>> = {}
    /**
     * Defines an optional list of field names represented as an array of strings.
     *
     * This property is used to specify the fields that should be included or
     * processed in a particular operation or context. The list may represent
     * specific field identifiers relevant to a data record or object.
     *
     * @type {string[] | undefined}
     */
    private valuesListFields?: string[]
    /**
     * Represents a flag indicating whether the values list is flattened.
     * If set to `true`, the values list is expected to be flat (single-dimensional).
     * If `false` or `undefined`, the values list may not be flattened.
     *
     * @type {boolean | undefined}
     */
    private valuesListFlat?: boolean

    /**
     * Constructor for initializing a query handler with a model class and backend.
     *
     * @param {new (data: any) => T} modelClass - The class constructor for the model.
     * @param {QueryBackend<T, F>} backend - The backend instance for query execution.
     */
    // constructor(modelClass: ModelClass<T>, backend: QueryBackend<T, F>) {
    constructor(modelClass: new (data: any) => T, backend: QueryBackend<T, F>) {
        this.modelClass = modelClass as ModelClass<T>
        this.backend = backend
    }

    /**
     * Creates a deep copy of the current QuerySet instance, including its filters, order, pagination, and field selection configurations.
     *
     * @return {QuerySet<T, F>} A new instance of QuerySet with copied configurations from the current instance.
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
        newInstance.onlyFields = this.onlyFields
        newInstance.selectRelatedFields = this.selectRelatedFields
        newInstance.prefetchRelatedFields = this.prefetchRelatedFields
        newInstance.relatedQuerySets = {...this.relatedQuerySets}

        return newInstance
    }

    /**
     * Applies the specified filters to the current QuerySet and returns a new QuerySet instance
     * with the updated filters applied.
     *
     * @param {F} filters - An object containing key-value pairs representing the filters to be added.
     * @return {QuerySet<T, F>} A new QuerySet instance with the combined filters.
     */
    filter(filters: F): QuerySet<T, F> {
        const clone = this.clone()
        clone.filters = {...clone.filters, ...filters}
        return clone
    }

    /**
     * Creates and returns a new QuerySet instance with the specified filters excluded.
     *
     * @param {F} filters - The filters to exclude from the current QuerySet.
     * @return {QuerySet<T, F>} A new QuerySet instance with the provided filters excluded.
     */
    exclude(filters: F): QuerySet<T, F> {
        const clone = this.clone()
        clone.filters = {...this.filters, NOT: filters}
        return clone
    }

    /**
     * Orders the query set by the specified fields.
     *
     * @param {string[]} fields - The fields to order the query set by. Order of fields determines sorting precedence.
     * @return {QuerySet<T, F>} A new query set instance ordered by the specified fields.
     */
    orderBy(...fields: string[]): QuerySet<T, F> {
        const clone = this.clone()
        clone.order = fields
        return clone
    }

    /**
     * Limits the number of records returned by the query to the specified number.
     *
     * @param {number} n - The maximum number of records to return.
     * @return {QuerySet<T, F>} A new QuerySet instance with the limit applied.
     */
    limit(n: number): QuerySet<T, F> {
        const clone = this.clone()
        clone.limitCount = n
        return clone
    }

    /**
     * Paginates the query set by setting a limit on the number of records to retrieve
     * and an optional offset to skip a certain number of records.
     *
     * @param {Object} params - An object containing pagination parameters.
     * @param {number} params.limit - The maximum number of records to retrieve.
     * @param {number} [params.offset] - Optional. The number of records to skip before starting to retrieve results.
     * @return {QuerySet<T, F>} A new QuerySet instance with the applied pagination settings.
     */
    paginate({limit, offset}: { limit: number; offset?: number }): QuerySet<T, F> {
        const clone = this.clone()
        clone.limitCount = limit
        clone.offsetCount = offset
        return clone
    }

    /**
     * Limits the selection of fields in the query to only the specified fields.
     *
     * @param {string[]} fields - The list of field names to include in the query set.
     * @return {QuerySet<T, F>} A new query set instance with the specified fields restricted.
     */
    only(...fields: string[]): QuerySet<T, F> {
        const clone = this.clone()
        clone.onlyFields = fields
        return clone
    }

    /**
     * Selects one or more related fields to include in the query.
     *
     * @param {string[]} fields - The names of related fields to include in the query.
     * @return {QuerySet<T, F>} A new QuerySet instance with the specified related fields selected.
     */
    selectRelated(...fields: string[]): QuerySet<T, F> {
        const clone = this.clone()
        clone.selectRelatedFields = fields
        return clone
    }

    /**
     * Prefetches related fields to optimize database queries and reduce the number of queries needed
     * when accessing related data for the current query set.
     *
     * @param {...string} fields - A list of strings representing the related fields to prefetch.
     * @return {QuerySet<T, F>} A cloned instance of the QuerySet with the specified related fields prefetched.
     */
    prefetchRelated(...fields: string[]): QuerySet<T, F> {
        const clone = this.clone()
        clone.prefetchRelatedFields = fields
        return clone
    }

    /**
     * Executes a query based on the configured filters, order, limits, offsets, and related fields,
     * returning a processed result set.
     *
     * This method interfaces with the backend to fetch data according to the options specified,
     * including handling related fields (`select_related`) and reverse-related fields (`prefetch_related`).
     * When `valuesListFields` is set, the results will be formatted accordingly (either flattened or nested).
     *
     * @return {Promise<any[]>} A promise that resolves to an array of results. The structure of the results
     * depends on the configuration (e.g., `valuesListFields`, `valuesListFlat`) and the raw data retrieved
     * from the backend.
     */
    async execute(): Promise<any[]> {
        const options: ExecuteOptions<F> = {
            filters: this.filters,
            order: this.order,
            limit: this.limitCount,
            offset: this.offsetCount,
            only: this.onlyFields,
            selectRelated: this.selectRelatedFields,
            prefetchRelated: this.prefetchRelatedFields,
            relatedQuerySets: {},
        }

        const fields = this.modelClass.getFields?.() ?? {}

        if (this.selectRelatedFields) {
            for (const fieldName of this.selectRelatedFields) {
                const field = fields[fieldName]
                if (!field || field.type !== "relation" || !field.model) continue

                const RelatedModel = this.modelClass.registry.get(field.model)
                if (!RelatedModel) continue

                options.relatedQuerySets![fieldName] = RelatedModel.objects
            }
        }

        if (this.prefetchRelatedFields) {
            for (const fieldName of this.prefetchRelatedFields) {
                const reverseModel = this.modelClass.registry.get(fieldName)
                if (!reverseModel) continue

                options.relatedQuerySets![fieldName] = reverseModel.objects
            }
        }

        const rawResults = await this.backend.execute(options)

        if (this.valuesListFields) {
            if (this.valuesListFlat && this.valuesListFields.length === 1) {
                const field = this.valuesListFields[0]
                return rawResults.map(item => item[field as keyof T])
            }

            return rawResults.map(item =>
                this.valuesListFields!.map(f => item[f as keyof T])
            )
        }

        return rawResults
    }

    /**
     * Retrieves all items by executing the corresponding query or operation.
     *
     * @return {Promise<T[]>} A promise that resolves to an array of items of type T.
     */
    async all(): Promise<T[]> {
        return this.execute()
    }

    /**
     * Retrieves the first result from the query execution if available.
     *
     * The method performs a query with a limit of 1 and returns the first result
     * if any results are available. If no results are found, it returns undefined.
     *
     * @return {Promise<T | undefined>} A promise that resolves to the first result of the query if available, otherwise undefined.
     */
    async first(): Promise<T | undefined> {
        const results = await this.limit(1).execute()
        return results.length > 0 ? results[0] : undefined
    }

    /**
     * Calculates and returns the total count of results obtained by executing a specific operation.
     *
     * @return {Promise<number>} A promise that resolves to the count of results as a number.
     */
    async count(): Promise<number> {
        const results = await this.execute()
        return results.length
    }

    /**
     * Retrieves a list of values for a specified field from the query set.
     * Can optionally return a flat list if the `flat` option is set to true.
     *
     * @param {K} field - The field name whose values should be retrieved.
     * @param {Object} [options] - Optional parameters to modify the method's behavior.
     * @param {boolean} [options.flat] - Indicates whether the result should be a flat list of values.
     * @return {QuerySet<T, F>} A query set containing the extracted field values based on the specified options.
     */
    valuesList<K extends keyof T>(
        field: K, options?: { flat?: boolean }
    ): QuerySet<T, F>
    /**
     * Retrieves a list of specified fields from the dataset and returns a query set with the selected values.
     *
     * @param {...K} fields - The fields to be included in the resulting query set. These must be valid keys of the type `T`.
     * @return {QuerySet<T, F>} Returns a query set containing the specified fields.
     */
    valuesList<K extends keyof T>(...fields: K[]): QuerySet<T, F>
    /**
     * Retrieves a query set that includes data for specified fields of the model.
     * Optionally, the data can be flattened if indicated.
     *
     * @param {...(K | [K, { flat?: boolean }])} args - One or more fields to include in the result,
     *        or a tuple containing fields and an optional configuration object with the `flat` property.
     *        The `flat` property, if true, returns a flat array instead of an array of arrays.
     * @return {QuerySet<T, F>} A new query set that includes the specified fields with optional flat configuration.
     */
    valuesList<K extends keyof T>(
        ...args: [K, { flat?: boolean }] | K[]
    ): QuerySet<T, F> {
        const clone = this.clone()

        let fields: string[]
        let flat = false

        const last = args[args.length - 1]
        if (typeof last === "object" && last !== null && "flat" in last) {
            fields = args.slice(0, -1) as string[]
            flat = last.flat ?? false
        } else {
            fields = args as string[]
        }

        clone.valuesListFields = fields
        clone.valuesListFlat = flat

        return clone
    }

    /**
     * Fetches a single object from the database based on the provided filters.
     * Throws an error if no objects or multiple objects match the filters.
     *
     * @param {F} filters - The filters to apply in the database query to retrieve the object.
     * @return {Promise<T>} A promise that resolves with the single object matching the filters.
     * @throws {DoesNotExist} If no object matches the provided filters.
     * @throws {MultipleObjectsReturned} If more than one object matches the provided filters.
     */
    async get(filters: F): Promise<T> {
        const modelName = (this.modelClass as any).name ?? "Model"
        const result = await this.filter(filters).limit(2).execute()
        if (result.length === 0) {
            throw new DoesNotExist(modelName, filters as any)
        }
        if (result.length > 1) {
            throw new MultipleObjectsReturned(modelName, filters as any)
        }
        return result[0]
    }

    /**
     * Persists the provided instance to the backend.
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
     * @return {Promise<void>} A promise that resolves when the instance has been successfully deleted.
     */
    async delete(instance: T): Promise<void> {
        return this.backend.delete(instance)
    }
}