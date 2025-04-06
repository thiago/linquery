import {describe, it, expect, vi, beforeEach} from "vitest"
import {BaseModel, type ModelClass, modelRegistry} from "../src"
import {MemoryBackend} from "../src/backends/memory"
import {QuerySet} from "../src"
import * as fields from "../src/model/fields"

class Group extends BaseModel {
    id!: string
    name!: string

    static fields = {
        id: fields.StringField(),
        name: fields.StringField(),
    }

    static backend = new MemoryBackend<Group, { id?: string }>()
    static objects = new QuerySet(Group, Group.backend)
}

class User extends BaseModel {
    id!: string
    name!: string
    group!: { id: string }

    static fields = {
        id: fields.StringField(),
        name: fields.StringField(),
        group: fields.RelationField("Group"),
    }

    static backend = new MemoryBackend<User, { id?: string; group?: { id: string } }>()
    static objects = new QuerySet(User, User.backend)
}

describe("BaseModel", () => {
    beforeEach(() => {
        modelRegistry.clean()
        modelRegistry.register(Group)
        modelRegistry.register(User)
    })

    it("creates a new instance via static new()", () => {
        const u = User.new({id: "1", name: "John"})
        expect(u).toBeInstanceOf(User)
        expect(u.name).toBe("John")
    })

    it("normalizes fields using toInternal", () => {
        const u = User.new({id: "1", name: "John"})
        expect(u.name).toBe("John")
    })

    it("saves and deletes an instance with signals", async () => {
        const preSave = vi.fn()
        const postSave = vi.fn()
        const preDelete = vi.fn()
        const postDelete = vi.fn()

        User.signals.on("pre_save", User, preSave)
        User.signals.on("post_save", User, postSave)
        User.signals.on("pre_delete", User, preDelete)
        User.signals.on("post_delete", User, postDelete)

        const u = User.new({id: "2", name: "Jane"})
        await u.save()
        await u.delete()

        expect(preSave).toHaveBeenCalled()
        expect(postSave).toHaveBeenCalled()
        expect(preDelete).toHaveBeenCalled()
        expect(postDelete).toHaveBeenCalled()
    })

    it("gets the primary key", () => {
        const u = User.new({id: "abc"})
        expect(u.getPk()).toBe("abc")
    })

    it("fetches related single model", async () => {
        const g = Group.new({id: "g1", name: "Dev"})
        const u = User.new({id: "u1", name: "Ana", group: {id: "g1"}})
        await g.save()
        await u.save()

        const related = await u.getRelated<Group>("group")
        expect(related?.name).toBe("Dev")
    })

    it("fetches related many models", async () => {
        const g = Group.new({id: "g2", name: "Design"})
        await g.save()

        await User.new({id: "u1", name: "Ana", group: {id: "g2"}}).save()
        await User.new({id: "u2", name: "Bia", group: {id: "g2"}}).save()

        const result = await g.getRelatedMany<User>("User", "group")
        expect(result.length).toBe(2)
        expect(result[0]).toBeInstanceOf(User)
    })

    it("throws error if related model is invalid", async () => {
        class Invalid extends BaseModel {
            static fields = {
                something: fields.RelationField("DoesNotExist")
            }
        }

        modelRegistry.register(Invalid)
        const i = new Invalid()
        // We're deliberately testing an invalid model name to trigger an error.
        // @ts-expect-error: 'something' is not a valid relation
        await expect(i.getRelated("something")).rejects.toThrow("not found")
    })

    it("infers fields if not defined", () => {
        class InferModel extends BaseModel {
            id = "123"
            active = true
        }

        const fields = InferModel.getFields()
        expect(fields.id?.type).toBe("string")
        expect(fields.active?.type).toBe("boolean")
    })
})