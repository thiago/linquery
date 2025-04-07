// model-registry.ts
import {BaseModel} from "./base-model"
import {ModelClass} from "../types";
import type {Field} from "../types"
import {ModelAlreadyRegistered, RelatedModelNotFoundError} from "../errors";

/**
 * A registry for managing and validating models in an application. This class is used to
 * register, retrieve, and validate models, ensuring their relationships and definitions are correct.
 */
export class ModelRegistry {
    private models = new Map<string, ModelClass<any>>()

    /**
     * Registers a model class with an optional name.
     *
     * @param {ModelClass<T>} modelClass - The class of the model to be registered.
     * @param {string} [name] - An optional name to register the model under. Defaults to the name of the model class.
     * @return {void} - Does not return any value.
     * @throws {ModelAlreadyRegistered} If a model with the given name is already registered.
     */
    register<T extends BaseModel>(modelClass: ModelClass<T>, name?: string) {
        const modelName = name || modelClass.name

        if (this.models.has(modelName)) {
            throw new ModelAlreadyRegistered(modelName)
        }
        modelClass.registry = this
        this.models.set(modelName, modelClass)
    }

    /**
     * Retrieves a model instance by its name.
     *
     * @param {string} name - The name of the model to retrieve.
     * @return {ModelClass<any> | undefined} The model instance if found, or undefined if not found.
     */
    get(name: string): ModelClass<any> | undefined {
        return this.models.get(name)
    }

    /**
     * Retrieves all the models currently stored.
     *
     * @return {ModelClass<any>[]} An array containing all the models.
     */
    getAll(): ModelClass<any>[] {
        return Array.from(this.models.values())
    }

    /**
     * Removes all entries from the `models` collection, effectively clearing it.
     *
     * @return {void} Does not return a value.
     */
    clean() {
        this.models.clear()
    }

    /**
     * Validates the models and their fields to ensure proper configuration of relations.
     *
     * This method checks the existence of related models for relation fields
     * and throws an error if a relation field references an unknown model. Additionally,
     * it dynamically defines reverse relation fields on the related models if not already defined.
     *
     * @return {void} Returns nothing. Throws an error if a validation issue is encountered.
     */
    validate() {
        for (const model of this.getAll()) {
            const fields = (model as any).fields as Record<string, Field<any>> | undefined
            if (!fields) continue

            for (const [fieldName, field] of Object.entries(fields)) {
                if (field.type === "relation") {
                    const relatedModel = this.get((field as any).model)
                    if (!relatedModel) {
                        throw new RelatedModelNotFoundError(model.name, fieldName, (field as any).model)
                    }

                    const reverseName = (field as any).reverseName || `${model.name.charAt(0).toLowerCase()}${model.name.slice(1)}Set`

                    if (!(reverseName in relatedModel.prototype)) {
                        Object.defineProperty(relatedModel.prototype, reverseName, {
                            value: function () {
                                return this.getRelatedMany(model.name, fieldName)
                            },
                            writable: false
                        })
                    }
                }
            }
        }
    }
}

/**
 * A variable that serves as an instance of the ModelRegistry class.
 * This registry is responsible for managing and storing models within the application.
 * It acts as a centralized storage to register, retrieve, and organize models efficiently.
 * Utilized to maintain a consistent reference to models throughout the application lifecycle.
 */
export const modelRegistry = new ModelRegistry()