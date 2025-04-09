import {getLookup} from "./lookup-registry"
import type {Filter, FilterLookup} from "./types"

function getByPath(obj: any, path: string): any {
    return path.split(".").reduce((acc, part) => acc?.[part], obj)
}

export function match<T = any>(item: T, filters: Filter): boolean {
    // Avalia a parte "normal" (sem operadores lógicos)
    const logicalKeys = new Set(["AND", "OR", "NOT"])
    const fieldConditions = Object.entries(filters).filter(([k]) => !logicalKeys.has(k))

    const fieldResult = fieldConditions.every(([key, value]) => {
        const fieldValue = getByPath(item, key)

        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
            return Object.entries(value as FilterLookup).every(([op, expected]) => {
                const lookup = getLookup(op)
                return lookup.compare(fieldValue, expected)
            })
        }

        return getLookup("eq").compare(fieldValue, value)
    })

    // Agora avalia os operadores lógicos com recursão
    if ("AND" in filters && filters.AND) {
        return fieldResult && match(item, filters.AND)
    }

    if ("OR" in filters && filters.OR) {
        return fieldResult || match(item, filters.OR)
    }

    if ("NOT" in filters && filters.NOT) {
        return fieldResult && !match(item, filters.NOT)
    }

    return fieldResult
}