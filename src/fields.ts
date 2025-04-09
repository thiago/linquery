import {EnumLike, EnumValues, Field, FieldTypeEnum, ModelClass, NestedModelClass} from "./types";

export function StringField(config: Partial<Field<string>> = {}): Field<string> {
    return {type: FieldTypeEnum.String, ...config}
}

export function NumberField(config: Partial<Field<number>> = {}): Field<number> {
    return {
        type: FieldTypeEnum.Number,
        toInternal: v => typeof v === "string" ? parseFloat(v) : v,
        ...config,
    }
}

export function BooleanField(config: Partial<Field<boolean>> = {}): Field<boolean> {
    return {type: FieldTypeEnum.Boolean, ...config}
}

export function DateField(config: Partial<Field<Date>> = {}): Field<Date> {
    return {
        type: FieldTypeEnum.Date,
        toInternal: v => new Date(),
        toExternal: d => d.toISOString(),
        ...config,
    }
}

export function RelationField(model: string | ModelClass<any>, config: Partial<Field<string>> = {}): Field<string> {
    return {
        type: FieldTypeEnum.Relation,
        model,
        ...config
    }
}

export function EmailField(config: Partial<Field<string>> = {}): Field<string> {
    return {
        type: FieldTypeEnum.Email,
        ...config
    }
}


export function EnumField<T extends string>(values: readonly T[], config?: Partial<Field<T>>): Field<T>
export function EnumField<T extends EnumLike>(values: T, config?: Partial<Field<EnumValues<T>>>): Field<EnumValues<T>>
export function EnumField(values: any, config: any = {}): any {
    const enumArray = Array.isArray(values)
        ? values
        : Object.values(values)

    return {
        type: FieldTypeEnum.Enum,
        enum: enumArray,
        ...config
    }
}

export function JSONField(config: Partial<Field<any>> = {}): Field<any> {
    return {
        type: FieldTypeEnum.JSON,
        toInternal: v => typeof v === "string" ? JSON.parse(v) : v,
        toExternal: v => JSON.stringify(v),
        ...config
    }
}

export function NestedField<T extends object>(model: NestedModelClass<any>, config: Partial<Field<any>> = {}): Field<T> {
    return {
        type: FieldTypeEnum.Nested,
        toInternal: (v) => model.new(v),
        toExternal: (v) => ({...v}),
        model,
    }
}