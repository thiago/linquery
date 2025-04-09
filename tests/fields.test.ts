import {describe, it, expect, beforeEach} from 'vitest'
import {
    StringField,
    NumberField,
    BooleanField,
    DateField,
    RelationField,
    EmailField,
    EnumField,
    JSONField
} from "../src"

describe("Field types", () => {
    it("StringField should return type 'string'", () => {
        const field = StringField()
        expect(field.type).toBe("string")
    })

    it("NumberField should parse string to number", () => {
        const field = NumberField()
        expect(field.toInternal?.("42.5")).toBe(42.5)
        expect(field.toInternal?.(10)).toBe(10)
    })

    it("BooleanField should return type 'boolean'", () => {
        const field = BooleanField()
        expect(field.type).toBe("boolean")
    })

    it("DateField should parse date and stringify", () => {
        const field = DateField()
        const d = new Date("2024-01-01T00:00:00Z")
        expect(field.toInternal?.("2024-01-01T00:00:00Z")).toEqual(d)
        expect(field.toExternal?.(d)).toBe("2024-01-01T00:00:00.000Z")
    })

    it("RelationField should have type 'relation' and set model", () => {
        const field = RelationField("User")
        expect(field.type).toBe("relation")
        expect(field.model).toBe("User")
    })

    it("EmailField should have type 'email'", () => {
        const field = EmailField()
        expect(field.type).toBe("email")
    })

    it("EnumField should have values", () => {
        const field = EnumField(["A", "B"])
        expect(field.type).toBe("enum")
        expect(field.enum).toEqual(["A", "B"])
    })

    it("JSONField should parse and stringify JSON", () => {
        const field = JSONField()
        const jsonStr = '{"x":1,"y":2}'
        const parsed = {x: 1, y: 2}
        expect(field.toInternal?.(jsonStr)).toEqual(parsed)
        expect(field.toExternal?.(parsed)).toBe(jsonStr)
    })
})
