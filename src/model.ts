import {BaseModelClass, Field, FieldTypeEnum, ModelClass, NestedModelClass} from "./types";
import {type ModelRegistry, registry} from "./registry"
import {type SignalRegistry, signals} from "./signals"
import type {QuerySet} from "./queryset"
import {InvalidRelationFieldError, RelatedModelNotFoundError} from "./errors";

export abstract class BaseModel {
    static pkField = "id"
    static fields: Record<string, Field> = {}

    constructor(data?: Record<string, any>) {
        if (data) {
            Object.assign(this, this.normalize(data as Partial<this>))
        }
    }

    static new<T extends Model>(this: new (data?: any) => T, data: Partial<T>): T {
        const instance = new this()
        Object.assign(instance, instance.normalize(data))
        return instance
    }

    getPk(): string | undefined {
        const pk = (this.constructor as typeof Model).pkField
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
        const fields = (this.constructor as typeof Model).getFields()
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

    static getSchema(): Record<string, (value: any) => any> {
        const fields = this.getFields()
        const schema: Record<string, (value: any) => any> = {}

        for (const [key, field] of Object.entries(fields)) {
            // Se o campo for nested e tiver uma model diretamente associada
            if (field.type === FieldTypeEnum.Nested && typeof field.model === "function" && "getSchema" in field.model) {
                schema[key] = (field.model as any).getSchema()
                continue
            }

            // Campo com validação direta
            if (field.validator) {
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

            // Validação normal
            if (typeof validatorOrSchema === "function") {
                try {
                    validatorOrSchema(value)
                } catch (e) {
                    throw new Error(`Validation error on '${key}': ${e}`)
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

    async getRelated<R extends Model>(fieldKey: keyof this): Promise<R | undefined> {
        const cls = this.constructor as typeof Model
        const field = cls.fields?.[fieldKey as string]
        if (!field || field.type !== FieldTypeEnum.Relation || !field.model) {
            throw new InvalidRelationFieldError(cls.name, String(fieldKey))
        }

        let relatedModel: ModelClass<R> | undefined

        if (typeof field.model === "string") {
            const registry = cls.registry
            relatedModel = registry.get(field.model) as unknown as ModelClass<R>
            if (!relatedModel) {
                throw new RelatedModelNotFoundError(cls.name, String(fieldKey), field.model)
            }
        } else {
            relatedModel = field.model as ModelClass<R>
        }

        const value = this[fieldKey]
        const id = typeof value === "object" && value !== null ? (value as any).id : value

        return relatedModel.objects.filter({id} as any).first()
    }

    getRelatedMany<R extends Model>(
        modelName: string,
        foreignKey: string
    ): QuerySet<R, any> {
        const cls = (this.constructor as typeof Model)
        const registry = cls.registry
        const relatedModel = registry.get(modelName) as unknown as ModelClass<R>
        if (!relatedModel) throw new RelatedModelNotFoundError(cls.name, String(foreignKey))

        const value = this.getPk()
        const filter = {[`${foreignKey}.id`]: value}
        return relatedModel.objects.filter(filter as any)
    }
}

export abstract class NestedModel extends BaseModel {
    static parent: ModelClass<any>
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