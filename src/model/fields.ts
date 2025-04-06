// field-types.ts

export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "relation"
  | "email"
  | "enum"
  | "json"
  | string

export type Field<T = any> = {
  type: FieldType
  required?: boolean
  default?: T
  label?: string
  description?: string
  enum?: T[]
  model?: string
  reverseName?: string
  toInternal?: (value: any) => T
  toExternal?: (value: T) => any
}

export function StringField(config: Partial<Field<string>> = {}): Field<string> {
  return { type: "string", ...config }
}

export function NumberField(config: Partial<Field<number>> = {}): Field<number> {
  return {
    type: "number",
    ...config,
    toInternal: v => typeof v === "string" ? parseFloat(v) : v
  }
}

export function BooleanField(config: Partial<Field<boolean>> = {}): Field<boolean> {
  return { type: "boolean", ...config }
}

export function DateField(config: Partial<Field<Date>> = {}): Field<Date> {
  return {
    type: "date",
    ...config,
    toInternal: v => new Date(v),
    toExternal: d => d.toISOString()
  }
}

export function RelationField(model: string, config: Partial<Field<string>> = {}): Field<string> {
  return {
    type: "relation",
    model,
    ...config
  }
}

export function EmailField(config: Partial<Field<string>> = {}): Field<string> {
  return {
    type: "email",
    ...config
  }
}

export function EnumField<T>(values: T[], config: Partial<Field<T>> = {}): Field<T> {
  return {
    type: "enum",
    enum: values,
    ...config
  }
}

export function JSONField(config: Partial<Field<any>> = {}): Field<any> {
  return {
    type: "json",
    toInternal: v => typeof v === "string" ? JSON.parse(v) : v,
    toExternal: v => JSON.stringify(v),
    ...config
  }
}
