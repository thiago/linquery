import {describe, it, expect, beforeEach} from 'vitest'
import {BaseModel, QuerySet, type Filter} from '../src'
import {MemoryBackend} from '../src/backends/memory'


class User extends BaseModel {
    id!: string
    name!: string
    age!: number
    static fields = {
        id: {type: 'string'},
        name: {type: 'string'},
        age: {type: 'number'}
    }
    static backend = new MemoryBackend<User, Filter<User>>()
    static objects = new QuerySet(User, User.backend)
}

describe('MemoryBackend', () => {
    beforeEach(async () => {
        (User.objects as any).backend.clear()
    })

    it('should save and retrieve a user by id', async () => {
        const user = new User({id: '1', name: 'Alice', age: 30})
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
        await new User({id: '1', name: 'Alice', age: 30}).save()
        await new User({id: '2', name: 'Bob', age: 40}).save()

        const results = await User.objects.filter({age: 40}).execute()
        expect(results.length).toBe(1)
        expect(results[0].name).toBe('Bob')
    })

    it('should support orderBy', async () => {
        await new User({id: '1', name: 'Alice', age: 25}).save()
        await new User({id: '2', name: 'Bob', age: 40}).save()
        await new User({id: '3', name: 'Charlie', age: 35}).save()

        const results = await User.objects.orderBy('-age').execute()
        expect(results.map(u => u.name)).toEqual(['Bob', 'Charlie', 'Alice'])
    })

    it('should support limit and pagination', async () => {
        for (let i = 1; i <= 10; i++) {
            await new User({id: `${i}`, name: `User ${i}`, age: 20 + i}).save()
        }

        const results = await User.objects.orderBy('age').limit(3).execute()
        expect(results.length).toBe(3)
        expect(results[0].name).toBe('User 1')
    })

    it('should delete a user', async () => {
        const user = new User({id: '1', name: 'ToDelete', age: 50})
        await user.save()

        await user.delete()
        const found = await User.objects.filter({id: '1'}).first()
        expect(found).toBeUndefined()
    })
})