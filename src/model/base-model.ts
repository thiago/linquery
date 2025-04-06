import {Field} from "./fields"
import {modelRegistry, type ModelRegistry} from "./registry"
import {signalsRegistry, type SignalRegistry} from "./signals"
import type {QuerySet} from "../queryset/queryset"
import type {ModelClass} from "../types";

/**
 * The `BaseModel` class serves as an abstract foundation for models, providing a set of methods
 * and properties to handle common model-related operations such as field normalization, data persistence,
 * and relationships with other models.
 *
 * Field Definitions:
 * - `pkField`: Static property representing the primary key field of the model. Defaults to "id".
 * - `fields`: Static property for manually defined field configurations.
 * - `signals`: Static property used for managing lifecycle hooks like "pre_save" and "post_delete".
 * - `registry`: Static property for accessing the model registry.
 * - `objects`: Static property providing access to model-specific query operations.
 *
 * Constructor:
 * - Accepts an optional `data` object with key-value pairs to initialize the instance. The provided data is
 *   normalized before being applied to the instance.
 *
 * Static Methods:
 * - `new(data)`: Creates a new instance of the derived model and initializes it with normalized data.
 * - `getFields()`: Returns the combined fields of the model, including both manually defined and inferred fields.
 *
 * Instance Methods:
 * - `getPk()`: Retrieves the primary key of the instance based on the defined `pkField`.
 * - `normalize(data)`: Normalizes the provided data object based on the field definitions of the model.
 * - `beforeSave()`: Hook method that runs prior to saving the model. Can be overridden for custom behavior.
 * - `save()`: Persists the current instance to the database, emitting pre-save and post-save signals.
 * - `delete()`: Deletes the current instance from the database, emitting pre-delete and post-delete signals.
 * - `getRelated(fieldKey)`: Fetches a related model instance via a "relation"-typed field.
 * - `getRelatedMany(modelName, foreignKey)`: Fetches a list of related model instances for a many-to-one or many-to-many relationship.
 *
 * Notes:
 * - Lifecycle signals such as "pre_save", "post_save", "pre_delete", and "post_delete" are emitted during save and delete operations.
 * - Field definitions can specify normalization logic using the `toInternal` method for converting data.
 * - Relationship fields (of type "relation") require proper field and model definitions in the `fields` object.
 */
export abstract class BaseModel {

    /**
     * Represents the primary key field for a database or data structure.
     * This variable stores the name of the field used as the unique identifier.
     */
    static pkField = "id"
    /**
     * An object used to store a collection of field definitions.
     *
     * Each key in the record represents the name of the field,
     * and the corresponding value is the field definition object.
     */
    static fields: Record<string, Field> = {}
    /**
     * A registry containing signal definitions for the application.
     *
     * The `signals` variable acts as an instance of `SignalRegistry` that stores and manages
     * various signals used for inter-component or inter-module communication. It can be
     * accessed to register, emit, or listen to specific signals throughout the system.
     *
     * @type {SignalRegistry}
     */
    static signals: SignalRegistry = signalsRegistry
    /**
     * A registry that manages the storage and retrieval of models.
     * The `registry` variable acts as an instance of `ModelRegistry`,
     * allowing operations such as registration, lookup, and management
     * of model definitions within the application.
     *
     * This is used as a central point of reference for models to ensure
     * consistency and to prevent duplicate model definitions.
     */
    static registry: ModelRegistry = modelRegistry
    /**
     * Represents a query set that enables querying and manipulating a collection of data.
     * This is a generic type that can work with any data types for both keys and values.
     *
     * @template TKey - Specifies the type of keys in the query set.
     * @template TValue - Specifies the type of filters in the query set.
     */
    static objects: QuerySet<any, any>

    constructor(data?: Record<string, any>) {
        if (data) {
            Object.assign(this, this.normalize(data as Partial<this>))
        }
    }


    /**
     * Creates a new instance of the class with the provided data, normalizing the data before assignment.
     *
     * @param {Partial<T>} data - The partial data object to initialize the instance with.
     * @return {T} A new instance of the class with the normalized and assigned data.
     */
    static new<T extends BaseModel>(this: new (data?: any) => T, data: Partial<T>): T {
        const instance = new this()
        Object.assign(instance, instance.normalize(data))
        return instance
    }

    /**
     * Retrieves the primary key field's value for the current instance.
     *
     * @return {string | undefined} The value of the primary key field, or undefined if it is not set.
     */
    getPk(): string | undefined {
        const pk = (this.constructor as typeof BaseModel).pkField
        return this[pk as keyof this] as string | undefined
    }

    /**
     * Retrieves the fields of the current model, combining manually defined fields
     * with automatically inferred fields based on the instance's properties.
     *
     * @return {Record<string, Field<any>>} An object containing all fields where keys represent field names
     * and values are Field objects describing each field's type and transformation logic.
     */
    static getFields(): Record<string, Field<any>> {
        const manualFields = this.fields ?? {}

        const ModelCtor = this as unknown as new () => any
        const sample = new ModelCtor()
        const inferred: Record<string, Field<any>> = {}
        for (const key of Object.getOwnPropertyNames(sample)) {
            inferred[key] = {
                type: typeof sample[key],
                toInternal: (v: any) => v,
            }
        }

        return {
            ...inferred,
            ...manualFields,
        }
    }

    /**
     * Normalizes the input data by transforming it using the internal field definitions
     * provided by the constructor's field mappings.
     *
     * @param {Partial<this>} data - The partial input data to be normalized.
     * @return {Partial<this>} The normalized data object, with each field processed
     *                         according to its respective internal transformation logic.
     */
    normalize(data: Partial<this>): Partial<this> {

        const fields = (this.constructor as typeof BaseModel).getFields() || {}
        const normalized: Record<string, any> = {}
        for (const [key, field] of Object.entries(fields)) {
            if (key in data && field.toInternal) {
                normalized[key] = field.toInternal((data as any)[key])
            } else {
                normalized[key] = (data as any)[key]
            }
        }
        return normalized as Partial<this>
    }

    /**
     * Executes logic or operations to be performed before saving an object or data.
     *
     * @return {this} Returns the current instance to allow for method chaining.
     */
    beforeSave(): this {
        return this
    }

    /**
     * Saves the current instance to the database. First, emits a "pre_save" signal, performs
     * the save operation, and then emits a "post_save" signal upon completion.
     * @return {Promise<void>} A promise that resolves once the save operation and related signals are complete.
     */
    async save(): Promise<void> {
        const cls = this.constructor as ModelClass<this>
        await cls.signals.emit("pre_save", cls, this)
        const qs = cls.objects as QuerySet<this, any>
        await qs.save(this.beforeSave())
        await cls.signals.emit("post_save", cls, this)
    }

    /**
     * Deletes the current instance from the database and emits signals
     * before and after the deletion process.
     *
     * The "pre_delete" signal is emitted before the instance is deleted,
     * allowing any pre-deletion handling or logic. The "post_delete"
     * signal is emitted after the instance is successfully deleted.
     *
     * @return {Promise<void>} A promise that resolves when the deletion process
     * is completed.
     */
    async delete(): Promise<void> {
        const cls = this.constructor as ModelClass<this>
        await cls.signals.emit("pre_delete", cls, this)
        const qs = cls.objects as QuerySet<this, any>
        await qs.delete(this)
        await cls.signals.emit("post_delete", cls, this)
    }

    /**
     * Fetches the related model record for the provided relation field key.
     *
     * @param {keyof this} fieldKey The key of the relation field for which to fetch the related model.
     * @return {Promise<R | undefined>} A promise that resolves to the related model instance if found, or undefined if not found.
     * @throws {Error} If the specified field key is not a valid relation or the related model cannot be located.
     */
    async getRelated<R extends BaseModel>(fieldKey: keyof this): Promise<R | undefined> {
        const field = (this.constructor as typeof BaseModel).fields?.[fieldKey as string]
        if (!field || field.type !== "relation" || !field.model) {
            throw new Error(`Field '${String(fieldKey)}' is not a valid relation`)
        }

        const registry = (this.constructor as typeof BaseModel).registry
        const relatedModel = registry.get(field.model) as unknown as ModelClass<R>
        if (!relatedModel) throw new Error(`Model '${field.model}' not found`)

        const value = this[fieldKey]
        const id = typeof value === "object" && value !== null ? (value as any).id : value
        return relatedModel.objects.filter({id} as any).first()
    }

    /**
     * Retrieves multiple related models based on the specified foreign key.
     *
     * @param {string} modelName - The name of the related model to retrieve.
     * @param {string} foreignKey - The foreign key in the related model to filter by.
     * @return {Promise<R[]>} A promise that resolves to an array of related models.
     */
    async getRelatedMany<R extends BaseModel>(
        modelName: string,
        foreignKey: string
    ): Promise<R[]> {
        const registry = (this.constructor as typeof BaseModel).registry
        const relatedModel = registry.get(modelName) as unknown as ModelClass<R>
        if (!relatedModel) throw new Error(`Model '${modelName}' not found`)

        const value = this.getPk()
        const filter = {[`${foreignKey}.id`]: value}
        return relatedModel.objects.filter(filter as any).execute()
    }
}