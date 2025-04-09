import {describe, it, expect, vi, beforeEach} from "vitest"
import {SignalRegistry, safeHandler, Model, type ModelClass} from "../src/"

class DummyModel extends Model {
    id!: string
}

describe("SignalRegistry", () => {
    let signals: SignalRegistry
    let dummyModel: ModelClass<DummyModel>
    let instance: DummyModel

    beforeEach(() => {
        signals = new SignalRegistry()
        dummyModel = DummyModel
        instance = DummyModel.new({id: "test"})
    })

    it("registers and emits handler for specific event", async () => {
        const handler = vi.fn()
        signals.on("pre_save", dummyModel, handler)
        await signals.emit("pre_save", dummyModel, instance)
        expect(handler).toHaveBeenCalledWith(instance)
    })

    it("supports multiple handlers", async () => {
        const h1 = vi.fn()
        const h2 = vi.fn()
        signals.on("post_save", dummyModel, h1)
        signals.on("post_save", dummyModel, h2)
        await signals.emit("post_save", dummyModel, instance)
        expect(h1).toHaveBeenCalled()
        expect(h2).toHaveBeenCalled()
    })

    it("can unregister a specific handler", async () => {
        const h1 = vi.fn()
        const h2 = vi.fn()
        signals.on("pre_delete", dummyModel, h1)
        signals.on("pre_delete", dummyModel, h2)
        signals.off("pre_delete", dummyModel, h1)
        await signals.emit("pre_delete", dummyModel, instance)
        expect(h1).not.toHaveBeenCalled()
        expect(h2).toHaveBeenCalled()
    })

    it("can unregister all handlers for an event", async () => {
        const h1 = vi.fn()
        const h2 = vi.fn()
        signals.on("post_delete", dummyModel, h1)
        signals.on("post_delete", dummyModel, h2)
        signals.off("post_delete", dummyModel)
        await signals.emit("post_delete", dummyModel, instance)
        expect(h1).not.toHaveBeenCalled()
        expect(h2).not.toHaveBeenCalled()
    })

    it("executes safeHandler without throwing", async () => {
        const errorHandler = safeHandler(() => {
            throw new Error("Boom")
        }, false)
        await expect(errorHandler(instance)).resolves.toBeUndefined()
    })
})
