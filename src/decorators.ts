import type {Field, ModelClass} from "./types";
import type {Model} from "./model";
import {registry, type ModelRegistry} from "./registry";

/**
 * Internal utility to create field decorators dynamically.
 * Automatically registers the field into the model's static `fields`.
 */
export function field<T>(field: Field<T>): PropertyDecorator {
    return (target, propertyKey) => {
        const ctor = target.constructor as any
        if (!ctor.fields) {
            ctor.fields = {}
        }
        // Register the field in static `fields`
        ctor.fields[propertyKey as string] = field
    }
}


/**
 * Decorator version of register
 */
export function register(name?: string | undefined, customRegistry?: ModelRegistry): ClassDecorator {
    return function (target: Function) {

        (customRegistry ?? registry).register(target as ModelClass<Model>, name)
    }
}

export default {
    field,
    register
}