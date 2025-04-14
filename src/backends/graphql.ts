// graphql-backend.ts
import type {Model} from "../model"
import {ExecuteOptions, ModelClass, ModelClassConstructor, OrderBy, Ordering, QueryBackend} from "../types"
import {Field, FieldTypeEnum} from "../types"

function orderArrayToObject(order: OrderBy[]): Record<string, OrderBy['direction']> {
    return Object.fromEntries(order.map(({field, direction}) => [field, direction || Ordering.ASC]))
}

function pluralize(word: string): string {
    if (!word) return ""

    // Ends with a consonant + y → replace y with ies (e.g., "party" -> "parties")
    if (word.endsWith("y") && !/[aeiou]y$/i.test(word)) {
        return word.slice(0, -1) + "ies"
    }

    // Ends with sibilant sounds → add "es" (e.g., "bus" -> "buses")
    if (/(s|sh|ch|x|z)$/i.test(word)) {
        return word + "es"
    }

    // Default: just add "s"
    return word + "s"
}


export interface FieldTree {
    [key: string]: true | FieldTree
}

/**
 * Builds a flat path-based tree, e.g.:
 * ["profile.email", "profile.name"] =>
 * { profile: { email: {}, name: {} } }
 */
export function buildFieldTree(paths: string[]): Record<string, any> {
    const tree: Record<string, any> = {}
    for (const path of paths) {
        const parts = path.split(".")
        let node = tree
        for (const part of parts) {
            if (!node[part]) node[part] = {}
            node = node[part]
        }
    }
    return tree
}

/**
 * Converts a flat `only` array like ["name", "profile.email", "profile.age"]
 * into a nested tree object.
 */
function buildOnlyTree(only: string[]): FieldTree {
    const tree: FieldTree = {}
    for (const path of only) {
        const parts = path.split(".")
        let current = tree
        for (const [i, part] of parts.entries()) {
            if (!(part in current)) {
                current[part] = i === parts.length - 1 ? true : {}
            }
            if (typeof current[part] === "object") {
                current = current[part] as FieldTree
            }
        }
    }
    return tree
}

/**
 * Converts nested-only tree to flat list of field names.
 * Useful for calling recursively.
 */
function flattenOnly(tree?: FieldTree): string[] | undefined {
    if (!tree) return undefined
    const fields: string[] = []
    for (const [key, value] of Object.entries(tree)) {
        if (value === true) {
            fields.push(key)
        } else {
            const subfields = flattenOnly(value as FieldTree) ?? []
            for (const sub of subfields) {
                fields.push(`${key}.${sub}`)
            }
        }
    }
    return fields
}

/**
 * Builds a nested GraphQL-compatible field tree from model fields.
 * Supports filtering by `only` and handles nested fields recursively.
 */
export function buildGraphQLFieldTreeFromFields(
    fields: Record<string, Field>,
    only?: string[]
): FieldTree {
    const result: FieldTree = {}
    const onlyTree: FieldTree | undefined = only ? buildOnlyTree(only) : undefined

    for (const [key, field] of Object.entries(fields)) {
        if (onlyTree && !(key in onlyTree)) continue

        if (
            field.type === FieldTypeEnum.Nested &&
            typeof field.model === "function" &&
            "getFields" in field.model
        ) {
            const nestedFields = (field.model as ModelClass<any>).getFields?.() ?? {}
            const nestedOnly =
                onlyTree && typeof onlyTree[key] === "object"
                    ? flattenOnly(onlyTree[key] as FieldTree)
                    : undefined

            result[key] = buildGraphQLFieldTreeFromFields(nestedFields, nestedOnly) as FieldTree
        } else {
            result[key] = true
        }
    }

    return result
}

/**
 * Renders a GraphQL field tree into query format with indentation.
 */
export function renderFieldTree(tree: Record<string, any>, indent = 2): string {
    const spaces = " ".repeat(indent)
    return Object.entries(tree)
        .map(([key, children]) => {
            if (Object.keys(children).length === 0 || children === true) {
                return `${spaces}${key}`
            }
            return `${spaces}${key} {\n${renderFieldTree(children, indent + 2)}\n${spaces}}`
        })
        .join("\n")
}

function capitalize(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1)
}

export class GraphQLBackend<T extends Model, F> implements QueryBackend<T, F> {
    protected modelClass: ModelClass<T>
    protected rootField?: string
    protected queryOperationName?: string
    protected deleteOperationName?: string
    protected createOperationName?: string
    protected updateOperationName?: string
    protected orderInput?: string
    protected filterInput?: string
    protected paginationInput: string
    protected isList: boolean

    constructor({
                    modelClass,
                    rootField,
                    queryOperationName,
                    deleteOperationName,
                    createOperationName,
                    updateOperationName,
                    orderInput,
                    filterInput,
                    paginationInput = 'OffsetPaginationInput',
                    isList = true
                }: {
        modelClass: ModelClassConstructor<T>,
        rootField?: string,
        queryOperationName?: string,
        deleteOperationName?: string,
        createOperationName?: string,
        updateOperationName?: string,
        orderInput?: string,
        filterInput?: string,
        paginationInput?: string,
        isList: boolean,
    }) {
        this.modelClass = modelClass as ModelClass<T>
        this.rootField = rootField
        this.queryOperationName = queryOperationName
        this.deleteOperationName = deleteOperationName
        this.createOperationName = createOperationName
        this.updateOperationName = updateOperationName
        this.orderInput = orderInput
        this.filterInput = filterInput
        this.paginationInput = paginationInput
        this.isList = isList
    }


    async execute(options: ExecuteOptions<F>): Promise<T[]> {
        const {query, variables} = await this.buildGraphQLQuery(options)
        const result = await this.queryRequest(query, variables)
        if (!result) return []
        let data = result[this.getRootField(options) as any]
        if (!data) return []
        if (!Array.isArray(data)) data = [data]
        return data.map(item => this.modelClass.new(item))
    }

    async delete(item: T): Promise<void> {

    }

    async save(item: T): Promise<void> {

    }

    async saveRequest(item: T): Promise<void> {
        throw new Error(`Missing GraphQL save implementation. Provide a \`save(item)\` method in your backend.`)
    }

    async deleteRequest(item: T): Promise<void> {
        throw new Error(`Missing GraphQL delete implementation. Provide a \`delete(item)\` method in your backend.`)
    }


    async queryRequest(query: string, variables: Record<string, any>): Promise<Record<string, T | T[]>> {
        throw new Error(`Missing GraphQL query implementation. Provide a \`query(query, variables)\` method in your backend.`)
    }

    getQueryOperationName(params: ExecuteOptions<F>) {
        return this.queryOperationName ?? pluralize(capitalize(this.modelClass.name))
    }

    getRootField(params: ExecuteOptions<F>) {
        return this.rootField ?? pluralize(capitalize(this.modelClass.name))
    }

    getOrderInput(params: ExecuteOptions<F>) {
        return this.orderInput ?? `${this.getRootField(params)}Order`
    }

    getPaginationInput(params: ExecuteOptions<F>) {
        return this.paginationInput
    }

    getFilterInput(params: ExecuteOptions<F>) {
        return this.filterInput ?? `${this.getRootField(params)}Filter`
    }

    getDeleteOperationName(params: ExecuteOptions<F>) {
        return this.deleteOperationName ?? `delete${capitalize(this.modelClass.name)}`
    }

    getUpdateOperationName(params: ExecuteOptions<F>) {
        return this.updateOperationName ?? `update${capitalize(this.modelClass.name)}`
    }

    getCreateOperationName(params: ExecuteOptions<F>) {
        return this.createOperationName ?? `create${capitalize(this.modelClass.name)}`
    }

    async buildGraphQLSave(item: T) {

    }
    async buildGraphQLQuery(params: ExecuteOptions<F>) {
        const {filters, pagination, ordering, only} = params
        const fieldTree = buildGraphQLFieldTreeFromFields(this.modelClass.getFields(), only)
        const rootField = this.getRootField(params)
        const operationName = this.getQueryOperationName(params)
        const filterInput = this.getFilterInput(params)
        const paginationInput = this.getPaginationInput(params)
        const orderInput = this.getOrderInput(params)
        const variableDecls = []
        if (this.isList) {
            if (!isEmpty(filters)) variableDecls.push(`$filters: ${filterInput}`)
            if (!isEmpty(pagination)) variableDecls.push(`$pagination: ${paginationInput}`)
            if (!isEmpty(ordering)) variableDecls.push(`$order: ${orderInput}`)
        }

        const args = []
        if (this.isList) {
            if (!isEmpty(filters)) args.push(`filters: $filters`)
            if (!isEmpty(pagination)) args.push(`pagination: $pagination`)
            if (!isEmpty(ordering)) args.push(`order: $order`)
        }
        const query = `
query ${operationName}${isEmpty(variableDecls) ? '' : '('}${variableDecls.join(', ')}${isEmpty(variableDecls) ? '' : ')'} {
    ${rootField}${isEmpty(args) ? '' : '('}${args.join(', ')}${isEmpty(args) ? '' : ')'} {
${renderFieldTree(fieldTree, 8)}
    }
}
`
        return {
            query,
            variables: {
                filters,
                pagination,
                order: orderArrayToObject(ordering ?? []),
            }
        }
    }
}

export function isEmpty(value: any): boolean {
    if (value == null) return true // null or undefined
    if (typeof value === "boolean") return false
    if (typeof value === "number") return isNaN(value)
    if (typeof value === "string") return value.trim().length === 0
    if (Array.isArray(value)) return value.length === 0
    if (value instanceof Date) return isNaN(value.getTime())
    if (typeof value === "object") return Object.keys(value).length === 0
    return false
}