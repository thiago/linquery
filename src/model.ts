import {BaseModelClass, Field, FieldTypeEnum, ModelClass, NestedModelClass} from "./types";
import {type ModelRegistry, registry} from "./registry"
import {type SignalRegistry, signals} from "./signals"
import type {QuerySet} from "./queryset"
import {InvalidRelationFieldError, RelatedModelNotFoundError, ValidationError} from "./errors";

const schemaCache: Record<string, any> = {}
const schemaBuilding: Set<string> = new Set()

export abstract class BaseModel {
    static pkField = "id"
    static fields: Record<string, Field> = {}

    constructor() {
        if (arguments.length > 0) {
            throw new Error(`${this.constructor.name} cannot be instantiated with data. Use ${this.constructor.name}.new() instead.`)
        }
    }

    static new<T extends BaseModel>(this: new (data?: any) => T, data?: Partial<T>): T {
        const instance = new this()
        if (!data) return instance
        Object.assign(instance, instance.normalize(data))
        return instance
    }

    getPk(): string | undefined {
        const pk = (this.constructor as typeof BaseModel).pkField
        return this[pk as keyof this] as string | undefined
    }

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

    normalize(data: Partial<this>): Partial<this> {
        const fields = (this.constructor as typeof BaseModel).getFields()
        const normalized: Record<string, any> = {}

        for (const [key, field] of Object.entries(fields)) {
            const raw = (data as any)[key]

            if (field.type === FieldTypeEnum.Nested && typeof field.model === "function") {

                const NestedModel = field.model as any
                // Instancia mesmo se for undefined ou null
                if (raw instanceof NestedModel) {
                    normalized[key] = raw
                } else {
                    normalized[key] = NestedModel.new(raw || {})
                }

            } else if (typeof raw !== "undefined") {
                // Aplica toInternal se houver
                normalized[key] = field.toInternal ? field.toInternal(raw) : raw
            }
        }

        return normalized as Partial<this>
    }

    static getSchema(cache: Map<string, Record<string, (value: any) => any>> = new Map()): Record<string, (value: any) => any> {
        const modelName = this.name

        // Already built? Return cached
        if (cache.has(modelName)) return cache.get(modelName)!

        const fields = this.getFields()
        const schema: Record<string, (value: any) => any> = {}

        // Cache early to break circular references
        cache.set(modelName, schema)

        for (const [key, field] of Object.entries(fields)) {
            if (
                field.type === FieldTypeEnum.Nested &&
                typeof field.model === "function" &&
                "getSchema" in field.model
            ) {
                const nestedModel = field.model as typeof BaseModel
                const nestedSchema = nestedModel.getSchema(cache)

                // Composite validator for nested model
                schema[key] = (value: any) => {
                    for (const [nestedKey, validator] of Object.entries(nestedSchema)) {
                        validator(value?.[nestedKey])
                    }
                    return true
                }
            } else if (field.validator) {
                schema[key] = field.validator
            }
        }

        return schema
    }

    async fullClean(): Promise<void> {
        const cls = this.constructor as typeof BaseModel
        const schema = cls.getSchema()

        for (const [key, validatorOrSchema] of Object.entries(schema)) {
            const value = this[key as keyof this]

            if (isBaseModelClass(value)) {
                await value.fullClean()
            }

            if (typeof validatorOrSchema === "function") {
                try {
                    validatorOrSchema(value)
                } catch (e) {
                    throw new ValidationError(key, value, e)
                }
            }
        }

        await this.clean(schema)
    }

    async clean(schema: Record<string, (value: any) => any>): Promise<void> {
        // Override this to add additional validation
    }
}

export abstract class Model extends BaseModel {

    static signals: SignalRegistry = signals

    static registry: ModelRegistry = registry

    static objects: QuerySet<any, any>

    beforeSave(): this {
        return this
    }

    async save(validate = true): Promise<void> {
        const cls = this.constructor as ModelClass<this>
        Object.assign(this, this.normalize(this))
        if (validate) await this.fullClean()
        await cls.signals.emit("pre_save", cls, this)
        const qs = cls.objects as QuerySet<this, any>
        await qs.save(this.beforeSave())
        await cls.signals.emit("post_save", cls, this)
    }

    async delete(): Promise<void> {
        const cls = this.constructor as ModelClass<this>
        await cls.signals.emit("pre_delete", cls, this)
        const qs = cls.objects as QuerySet<this, any>
        await qs.delete(this)
        await cls.signals.emit("post_delete", cls, this)
    }

    prepareRelated<R extends Model>(fieldKey: keyof this): QuerySet<R, any> {
        const cls = this.constructor as typeof Model
        const field = cls.getFields()[fieldKey as string]

        if (!field || field.type !== FieldTypeEnum.Relation || !field.model) {
            throw new InvalidRelationFieldError(cls.name, String(fieldKey))
        }

        const relatedModel = typeof field.model === "string" ? cls.registry.get(field.model) as ModelClass<R> : field.model as ModelClass<R>

        if (!relatedModel) {
            throw new RelatedModelNotFoundError(cls.name, String(fieldKey), String(field.model))
        }

        const value = this[fieldKey]
        const id = typeof value === "object" && value !== null ? (value as any).id : value

        return relatedModel.objects.filter({id} as any)
    }

    async getRelated<R extends Model>(fieldKey: keyof this): Promise<R | undefined> {
        return this.prepareRelated<R>(fieldKey).first()
    }

    getRelatedMany<R extends Model>(fieldKey: keyof this): QuerySet<R, any> {
        const cls = this.constructor as typeof Model
        const field = cls.getFields()[fieldKey as string]

        if (!field || !(field.type === FieldTypeEnum.Reverse || field.type === FieldTypeEnum.ManyToMany)) {
            throw new InvalidRelationFieldError(cls.name, String(fieldKey))
        }

        const relatedModel = typeof field.model === "string"
            ? cls.registry.get(field.model) as ModelClass<R>
            : field.model as ModelClass<R>

        if (!relatedModel) {
            throw new RelatedModelNotFoundError(cls.name, String(fieldKey), String(field.model))
        }

        const reverseKey = field.relatedName ?? `${cls.name.charAt(0).toLowerCase()}${cls.name.slice(1)}`
        const value = this.getPk()
        const filter = {[`${reverseKey}.id`]: value}

        return relatedModel.objects.filter(filter as any)
    }
}

export abstract class NestedModel extends BaseModel {
}

export function isBaseModelClass<T extends BaseModel = any>(value: any): value is BaseModelClass<T> {
    return (
        typeof value === "function" &&
        typeof value.getFields === "function" &&
        typeof value.new === "function" &&
        typeof value.fullClean === "function"
    )
}

export function isModelClass<T extends Model = any>(value: any): value is ModelClass<T> {
    return (
        typeof value === "function" &&
        typeof value.getFields === "function" &&
        typeof value.new === "function" &&
        typeof value.save === "function" &&
        typeof value.delete === "function"
    )
}

export function isNestedModelClass<T extends NestedModel = any>(value: any): value is NestedModelClass<T> {
    return (
        typeof value === "function" &&
        typeof value.getFields === "function" &&
        typeof value.new === "function" &&
        typeof value.fullClean === "function"
    )
}