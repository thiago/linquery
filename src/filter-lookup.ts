import type {Filter} from "./types"

export interface Lookup {
  compare(left: any, right: any): boolean
}

const registry: Record<string, Lookup> = {}

export function registerLookup(name: string, impl: Lookup) {
  registry[name] = impl
}

export function getLookup(name: string): Lookup {
  return registry[name] ?? {
    compare: (a, b) => a === b
  }
}

// Built-in lookups
registerLookup("eq", { compare: (a, b) => a === b })
registerLookup("ne", { compare: (a, b) => a !== b })
registerLookup("gt", { compare: (a, b) => a > b })
registerLookup("gte", { compare: (a, b) => a >= b })
registerLookup("lt", { compare: (a, b) => a < b })
registerLookup("lte", { compare: (a, b) => a <= b })
registerLookup("in", { compare: (a, b) => Array.isArray(b) && b.includes(a) })
registerLookup("notIn", { compare: (a, b) => Array.isArray(b) && !b.includes(a) })
registerLookup("contains", { compare: (a, b) => typeof a === 'string' && a.includes(b) })
registerLookup("iContains", { compare: (a, b) => typeof a === 'string' && a.toLowerCase().includes(String(b).toLowerCase()) })
registerLookup("startsWith", { compare: (a, b) => typeof a === 'string' && a.startsWith(b) })
registerLookup("iStartsWith", { compare: (a, b) => typeof a === 'string' && a.toLowerCase().startsWith(String(b).toLowerCase()) })
registerLookup("endsWith", { compare: (a, b) => typeof a === 'string' && a.endsWith(b) })
registerLookup("iEndsWith", { compare: (a, b) => typeof a === 'string' && a.toLowerCase().endsWith(String(b).toLowerCase()) })
registerLookup("exact", { compare: (a, b) => a === b })
registerLookup("iExact", { compare: (a, b) => String(a).toLowerCase() === String(b).toLowerCase() })
registerLookup("is", { compare: (a, b) => a === b })
registerLookup("isNull", { compare: (a, b) => (a === null || a === undefined) === b })
registerLookup("exists", { compare: (a, b) => (a !== undefined) === b })
registerLookup("range", {
  compare: (a, { start, end }) => a >= start && a <= end
})
registerLookup("length", {
  compare: (a, b) => {
    if (typeof b === 'number') return a?.length === b
    if (typeof a?.length === 'number') {
      return Object.entries(b).every(([op, val]) => getLookup(op).compare(a.length, val))
    }
    return false
  }
})

function getByPath(obj: any, path: string): any {
    return path.split(".").reduce((acc, part) => acc?.[part], obj)
}

/**
 * Evaluates whether a given item matches the provided filter conditions.
 * Supports both field-level lookups (e.g., `contains`, `gte`) and logical operators (`AND`, `OR`, `NOT`).
 *
 * @param item - The object to test against the filters.
 * @param filters - A Filter object specifying lookup conditions and logical groupings.
 * @returns boolean indicating whether the item satisfies the filter criteria.
 */
export function filterLookup<T = any>(item: T, filters: Filter): boolean {
    // Define the logical operators to separate them from regular field filters
    const logicalKeys = new Set(["AND", "OR", "NOT"])

    // Extract field-level conditions (excluding logical operators)
    const fieldConditions = Object.entries(filters).filter(([k]) => !logicalKeys.has(k))

    // Evaluate all field-level conditions
    const fieldResult = fieldConditions.every(([key, value]) => {
        // Retrieve the actual value from the item using dot notation if necessary
        const fieldValue = getByPath(item, key)

        // If value is an object, treat it as one or more lookup operations (e.g., { contains: 'foo' })
        if (
            typeof value === "object" &&
            value !== null &&
            !Array.isArray(value)
        ) {
            return Object.entries(value).every(([op, expected]) => {
                const lookup = getLookup(op) // Get the corresponding lookup handler
                return lookup.compare(fieldValue, expected) // Compare item field with expected value
            })
        }

        // If value is a primitive (e.g., string, number), treat it as an exact match
        const lookup = getLookup("exact")
        return lookup.compare(fieldValue, value)
    })

    // Handle the logical AND operator recursively
    if ("AND" in filters && filters.AND) {
        return fieldResult && filterLookup(item, filters.AND)
    }

    // Handle the logical OR operator recursively
    if ("OR" in filters && filters.OR) {
        return fieldResult || filterLookup(item, filters.OR)
    }

    // Handle the logical NOT operator recursively
    if ("NOT" in filters && filters.NOT) {
        return fieldResult && !filterLookup(item, filters.NOT)
    }

    // Return the result of field-only filters if no logical operators are present
    return fieldResult
}