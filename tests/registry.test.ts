import {describe, it, expect, beforeEach} from "vitest"
import {Model, ModelRegistry} from "../src"
import * as fields from "../src/fields"

class Group extends Model {
    id!: string
    name!: string

    static fields = {
        id: fields.StringField(),
        name: fields.StringField(),
    }
}

class BankAccount extends Model {
    id!: string
    name!: string
    group!: { id: string }

    static fields = {
        id: fields.StringField(),
        name: fields.StringField(),
        group: fields.RelationField("Group"),
    }
}

describe("ModelRegistry", () => {
    let registry: ModelRegistry

    beforeEach(() => {
        registry = new ModelRegistry()
    })

    it("registers and retrieves a model", () => {
        registry.register(Group)
        const retrieved = registry.get("Group")
        expect(retrieved).toBe(Group)
    })

    it("throws on duplicate registration", () => {
        registry.register(Group)
        expect(() => registry.register(Group)).toThrow()
    })

    it("returns all registered models", () => {
        registry.register(Group)
        registry.register(BankAccount)
        expect(registry.getAll().length).toBe(2)
    })

    it("validates relation fields and adds reverse property", () => {
        registry.register(Group)
        registry.register(BankAccount)
        registry.validate()

        const instance = Group.new({id: "1", name: "test"})
        expect(typeof (instance as any).bankAccountSet).toBe("function")
    })

    it("throws error on unknown related model", () => {
        class Broken extends Model {
            static fields = {
                group: fields.RelationField("Unknown")
            }
        }

        registry.register(Broken)
        expect(() => registry.validate()).toThrow("referencing unknown model")
    })

    it("respects custom reverseName", () => {
        class CustomReverse extends Model {
            id!: string
            static fields = {
                group: fields.RelationField("Group", {relatedName: "customGroupAccounts"})
            }
        }

        registry.register(Group)
        registry.register(CustomReverse)
        registry.validate()

        const instance = Group.new({id: "1", name: "G1"})
        expect(typeof (instance as any).customGroupAccounts).toBe("function")
    })
})