import {describe, it, expect, beforeEach} from 'vitest'
import {Model, QuerySet, type Filter, ModelRegistry, RelationField, ManyToManyField} from '../src'
import {MemoryBackend} from '../src/backends/memory'

const registry = new ModelRegistry()

class Group extends Model {
    id!: string
    name!: string
    static fields = {
        id: {type: 'string'},
        name: {type: 'string'}
    }
    static backend = new MemoryBackend<Group, { id?: string, name?:string }>(Group)
    static objects = new QuerySet(Group, Group.backend)
}

class Tag extends Model {
    id!: string
    name!: string
    static fields = {
        id: {type: 'string'},
        name: {type: 'string'}
    }
    static backend = new MemoryBackend<Tag, { id?: string, name?:string }>(Tag)
    static objects = new QuerySet(Tag, Tag.backend)
}
class User extends Model {
    id!: string
    name!: string
    age!: number
    group!: Partial<Group>
    tags!: Partial<Tag>[]
    static fields = {
        id: {type: 'string'},
        name: {type: 'string'},
        age: {type: 'number'},
        group: RelationField(Group),
        tags: ManyToManyField(Tag)
    }
    static backend = new MemoryBackend<User, Filter<User>>(User)
    static objects = new QuerySet(User, User.backend)
}

describe('MemoryBackend', () => {
    beforeEach(async () => {
        await User.backend.clear()
        await Group.backend.clear()
        registry.clean()
        registry.register(Group)
        registry.register(User)
        registry.register(Tag)
    })

    it('should save and retrieve a user by id', async () => {
        const user = User.new({id: '1', name: 'Alice', age: 30})
        await user.save()
        const result = await User.objects.filter({id: '1'}).first()
        expect(result?.name).toBe('Alice')
        expect(result?.age).toBe(30)
    })

    it('should save and retrieve a user by id', async () => {
        const user = User.new({id: '1', name: 'Alice', age: 30})
        await user.save()

        const result = await User.objects.filter({id: '1'}).first()
        expect(result?.name).toBe('Alice')
        expect(result?.age).toBe(30)
    })

    it('should filter users by simple field', async () => {
        await User.new({id: '1', name: 'Alice', age: 30}).save()
        await User.new({id: '2', name: 'Bob', age: 40}).save()

        const results = await User.objects.filter({age: 40}).execute()
        expect(results.length).toBe(1)
        expect(results[0].name).toBe('Bob')
    })

    it('should support orderBy', async () => {
        await User.new({id: '1', name: 'Alice', age: 25}).save()
        await User.new({id: '2', name: 'Bob', age: 40}).save()
        await User.new({id: '3', name: 'Charlie', age: 35}).save()

        const results = await User.objects.orderBy('-age').execute()
        expect(results.map(u => u.name)).toEqual(['Bob', 'Charlie', 'Alice'])
    })

    it('should support limit and pagination', async () => {
        for (let i = 1; i <= 10; i++) {
            await User.new({id: `${i}`, name: `User ${i}`, age: 20 + i}).save()
        }

        const results = await User.objects.orderBy('age').limit(3).execute()
        expect(results.length).toBe(3)
        expect(results[0].name).toBe('User 1')
    })

    it('should delete a user', async () => {
        const user = User.new({id: '1', name: 'ToDelete', age: 50})
        await user.save()

        await user.delete()
        const found = await User.objects.filter({id: '1'}).first()
        expect(found).toBeUndefined()
    })

    it("fetches related single model", async () => {
        const g = Group.new({id: "g1", name: "Dev"})
        const g2 = Group.new({id: "g1", name: "Dev2"})
        const u = User.new({id: "u1", name: "Ana", group: {id: "g1"}})
        await g.save()
        await u.save()

        const related = await u.getRelated<Group>("group")
        expect(related?.name).toBe("Dev")
    })

    it("fetches selectRelated single model", async () => {
        const g = Group.new({id: "g1", name: "Dev"})
        const g2 = Group.new({id: "g2", name: "Dev2"})
        const u = User.new({id: "u1", name: "Ana", group: {id: "g1"}})
        await g.save()
        await g2.save()
        await u.save()

        const user = await User.objects.selectRelated("group").filter({id: "u1"}).first()
        expect(user?.name).toBe("Ana")
        expect(user?.group.name).toBe("Dev")
    })

    it("fetches prefetchRelated single model", async () => {
        const g = Group.new({id: "g1", name: "Dev"})
        const g2 = Group.new({id: "g2", name: "Dev2"})
        await g.save()
        await g2.save()

        const tag = Tag.new({id: "t1", name: "Tag1"})
        const tag2 = Tag.new({id: "t2", name: "Tag2"})
        const tag3 = Tag.new({id: "t3", name: "Tag3"})

        await tag.save()
        await tag2.save()
        await tag3.save()

        const u = User.new({id: "u1", name: "Ana", group: {id: "g1"}, tags: [{id: 't1'}, {id: 't2'}]})
        await u.save()

        const user = await User.objects.selectRelated("group").prefetchRelated("tags").filter({id: "u1"}).first()
        expect(user?.name).toBe("Ana")
        expect(user?.group.name).toBe("Dev")
        expect(user?.tags).toHaveLength(2)
        expect(user?.tags[0].name).toBe("Tag1")
        expect(user?.tags[1].name).toBe("Tag2")
        const other = await User.objects.selectRelated("group").prefetchRelated({tags: {filters: {name: {contains: '2'}}}}).filter({id: "u1"}).first()
        expect(other?.tags).toHaveLength(1)
        expect(other?.tags[0].name).toBe("Tag2")
    })
})