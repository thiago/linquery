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