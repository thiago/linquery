// graphql-backend.ts
import type {Model} from "../model"
import {QueryBackend, ModelClass, Ordering} from "../types"

export type GraphQLQueryExecutor<T, FilterType, Order> = (params: {
    filters?: FilterType
    pagination?: { limit?: number, offset?: number }
    order?: Partial<Order>
}) => Promise<T[]>

export class GraphqlBackend<T extends Model, F, Order> implements QueryBackend<T, F> {
    constructor(
        private executor: GraphQLQueryExecutor<T, F, Order>,
        private modelClass: ModelClass<T>
    ) {
    }

    async execute({filters, order, limit, offset}: {
        filters?: F
        order?: string[]
        limit?: number
        offset?: number
    }): Promise<T[]> {
        const orderInput = this.convertOrdering(order)

        const result = await this.executor({
            filters: filters,
            pagination: limit || offset ? {limit, offset} : undefined,
            order: orderInput
        })

        return result.map((item) => this.modelClass.new(item))
    }

    async save(item: T): Promise<void> {
        // optional: implement if you want mutation support
        console.warn("save() not implemented in GraphQLBackend")
    }

    async delete(item: T): Promise<void> {
        // optional: implement if you want mutation support
        console.warn("delete() not implemented in GraphQLBackend")
    }

    private convertOrdering(orderFields: string[] = []): Partial<Order> {
        const order: Record<string, Ordering> = {}
        for (const field of orderFields) {
            if (field.startsWith("-")) {
                order[field.slice(1)] = Ordering.Desc
            } else {
                order[field] = Ordering.Asc
            }
        }
        return order as Partial<Order>
    }
}