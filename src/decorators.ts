import type {Field, ModelClass} from "./types";
import type {BaseModel} from "./model/base-model";
import {modelRegistry, type ModelRegistry} from "./model/registry";

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
export function register(name?: string | undefined, registry?: ModelRegistry): ClassDecorator {
    return function (target: Function) {

        (registry ?? modelRegistry).register(target as ModelClass<BaseModel>, name)
    }
}

export default {
    field,
    register
}