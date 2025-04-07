import {describe, it, expect, vi, beforeEach} from "vitest"
import {BaseModel, type ModelClass, ModelRegistry, modelRegistry} from "../src"
import {MemoryBackend} from "../src/backends/memory"
import {QuerySet} from "../src"
import * as fields from "../src/model/fields"
import {InvalidRelationFieldError, RelatedModelNotFoundError} from "../src/errors";

const registry = new ModelRegistry()

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
        Group.backend.clear()
        User.backend.clear()
        registry.clean()
        registry.register(Group)
        registry.register(User)
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
        expect(await result.count()).toBe(2)
        expect(await result.first()).toBeInstanceOf(User)
    })

    it("throws error if related model is invalid", async () => {
        class Invalid extends BaseModel {
            static fields = {
                something: fields.RelationField("DoesNotExist")
            }
        }

        registry.register(Invalid)
        const i = new Invalid()
        // We're deliberately testing an invalid model name to trigger an error.
        // @ts-expect-error: 'something' is not a valid relation
        await expect(i.getRelated("something")).rejects.toThrow(RelatedModelNotFoundError)
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

    it("returns related model instance when valid", async () => {
        const group = new Group({id: "g1", name: "Admin"})
        await group.save()

        const user = User.new({id: "u1", name: "Alice", group: {id: "g1"}})
        await user.save()

        const related = await user.getRelated<Group>("group")
        expect(related).toBeInstanceOf(Group)
        expect(related?.id).toBe("g1")
    })

    it("throws InvalidRelationFieldError for missing field", async () => {
        const user = User.new({id: "u2", name: "Bob"})

        // @ts-expect-error: Testing runtime invalid field
        await expect(user.getRelated("invalidField")).rejects.toThrow(InvalidRelationFieldError)
    })

    it("throws InvalidRelationFieldError for non-relation field", async () => {
        class OtherUser extends BaseModel {
            id!: string
            name!: string

            static fields = {
                name: {type: "string"}
            }

            static backend = new MemoryBackend<OtherUser, any>()
            static objects = new QuerySet(OtherUser, OtherUser.backend)
        }

        registry.register(OtherUser)

        const u = OtherUser.new({id: "u3", name: "Carol"})
        await expect(u.getRelated("name")).rejects.toThrow(InvalidRelationFieldError)
    })

    it("throws RelatedModelNotFoundError when related model is not registered", async () => {
        class Broken extends BaseModel {
            id!: string
            owner?: string

            static fields = {
                owner: {type: "relation", model: "UnregisteredModel"}
            }

            static backend = new MemoryBackend<Broken, any>()
            static objects = new QuerySet(Broken, Broken.backend)
        }

        registry.register(Broken)

        const b = Broken.new({id: "b1", owner: "x"})
        await expect(b.getRelated("owner")).rejects.toThrow(RelatedModelNotFoundError)
    })

    it("returns undefined if related instance not found", async () => {
        const user = User.new({id: "u4", name: "Ghost", group: {id: "nonexistent"}})
        const related = await user.getRelated<Group>("group")
        expect(related).toBeUndefined()
    })

    it("should return related many instances based on foreign key", async () => {
        const group = Group.new({id: "g1", name: "Developers"})
        await group.save()
        const group2 = Group.new({id: "g2", name: "Viewers"})
        await group2.save()

        await User.new({id: "u1", name: "Alice", group: {id: "g1"}}).save()
        await User.new({id: "u2", name: "Bob", group: {id: "g1"}}).save()
        await User.new({id: "u3", name: "Eve", group: {id: "g2"}}).save()

        const relatedUsers = group.getRelatedMany<User>("User", "group")
        expect(await relatedUsers.all()).toHaveLength(2)

        const relatedViewers = group2.getRelatedMany<User>("User", "group")
        expect(await relatedViewers.all()).toHaveLength(1)
        expect(await relatedUsers.valuesList('name', {flat: true}).execute()).toEqual(expect.arrayContaining(["Alice", "Bob"]))
        expect((await Group.objects.all())).toHaveLength(2)
    })

    it("returns an empty array if no related models match", async () => {
        const group = Group.new({id: "g100", name: "Empty Group"})
        await group.save()

        const relatedUsers = await group.getRelatedMany<User>("User", "group").all()
        expect(relatedUsers).toHaveLength(0)
    })
})