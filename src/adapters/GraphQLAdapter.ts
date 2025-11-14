/**
 * GraphQL Adapter
 *
 * Allows ORM to work with GraphQL APIs by translating ORM operations
 * into GraphQL queries and mutations.
 */

import type { BackendAdapter, ModelClass, QueryPlan, CompiledFilter } from '../types';

export type QueryNameFn = (model: ModelClass) => string;

/**
 * Custom query builder for operations
 */
export interface QueryBuilder<T = unknown> {
  buildQuery(model: ModelClass<T>, fields: string[], variables?: Record<string, unknown>): string;
  buildVariables?(data: Record<string, unknown>): Record<string, unknown>;
}

/**
 * Custom queries/mutations - allows complete override
 */
export interface CustomQueries {
  create?: string;
  find?: string;
  update?: string;
  delete?: string;
  count?: string;
}

export interface GraphQLAdapterOptions {
  endpoint: string;
  headers?: Record<string, string>;

  // Query/mutation naming conventions
  queryNames?: {
    list?: string | QueryNameFn;
    get?: string | QueryNameFn;
    create?: string | QueryNameFn;
    update?: string | QueryNameFn;
    delete?: string | QueryNameFn;
  };

  // Field mapping (ORM field name -> GraphQL field name)
  fieldMapping?: Record<string, string>;

  // Response data paths
  responsePaths?: {
    list?: string;
    get?: string;
    create?: string;
    update?: string;
    delete?: string;
  };

  // Custom query builders for each operation
  queryBuilders?: {
    create?: QueryBuilder;
    find?: QueryBuilder;
    update?: QueryBuilder;
    delete?: QueryBuilder;
    count?: QueryBuilder;
  };

  // Direct query/mutation overrides (highest priority)
  customQueries?: CustomQueries;

  // Custom fetch function (for testing or custom HTTP clients)
  fetchFn?: typeof fetch;
}

interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
  }>;
}

/**
 * GraphQLAdapter - Backend adapter for GraphQL APIs
 */
export class GraphQLAdapter implements BackendAdapter {
  protected readonly endpoint: string;
  protected readonly headers: Record<string, string>;
  protected readonly queryNames: {
    list: string | QueryNameFn;
    get: string | QueryNameFn;
    create: string | QueryNameFn;
    update: string | QueryNameFn;
    delete: string | QueryNameFn;
  };
  protected readonly fieldMapping: Record<string, string>;
  protected readonly responsePaths: {
    list: string;
    get: string;
    create: string;
    update: string;
    delete: string;
  };
  protected readonly queryBuilders?: {
    create?: QueryBuilder;
    find?: QueryBuilder;
    update?: QueryBuilder;
    delete?: QueryBuilder;
    count?: QueryBuilder;
  };
  protected readonly customQueries?: CustomQueries;
  protected readonly fetchFn: typeof fetch;
  private connected: boolean = false;

  constructor(options: GraphQLAdapterOptions) {
    this.endpoint = options.endpoint;
    this.headers = options.headers || {};
    this.fetchFn = options.fetchFn || fetch;

    // Default query names (lowercase model name)
    this.queryNames = {
      list: options.queryNames?.list || ((model: ModelClass) => `${this.getModelName(model)}s`),
      get: options.queryNames?.get || ((model: ModelClass) => this.getModelName(model)),
      create: options.queryNames?.create || ((model: ModelClass) => `create${model.name}`),
      update: options.queryNames?.update || ((model: ModelClass) => `update${model.name}`),
      delete: options.queryNames?.delete || ((model: ModelClass) => `delete${model.name}`),
    };

    this.fieldMapping = options.fieldMapping || {};

    // Default response paths
    this.responsePaths = {
      list: options.responsePaths?.list || 'nodes',
      get: options.responsePaths?.get || '',
      create: options.responsePaths?.create || '',
      update: options.responsePaths?.update || '',
      delete: options.responsePaths?.delete || 'success',
    };

    // Store custom builders and queries
    this.queryBuilders = options.queryBuilders;
    this.customQueries = options.customQueries;
  }

  protected getModelName(model: ModelClass): string {
    return model.name.toLowerCase();
  }

  protected getQueryName(operation: 'list' | 'get' | 'create' | 'update' | 'delete', model: ModelClass): string {
    const name = this.queryNames[operation];
    return typeof name === 'function' ? name(model) : name;
  }

  protected mapFieldName(ormField: string): string {
    return this.fieldMapping[ormField] || ormField;
  }

  protected getFieldsFromModel(model: ModelClass): string[] {
    const fields = model.getFields?.();
    if (!fields) {
      return ['id'];
    }

    const fieldNames: string[] = [];
    for (const [fieldName] of fields) {
      // Skip internal fields
      if (!fieldName.startsWith('_')) {
        fieldNames.push(this.mapFieldName(fieldName));
      }
    }

    return fieldNames.length > 0 ? fieldNames : ['id'];
  }

  protected buildFieldSelection(model: ModelClass): string {
    const fields = this.getFieldsFromModel(model);
    return fields.join('\n      ');
  }

  protected buildFiltersVariable(filters: CompiledFilter[]): Record<string, unknown> {
    const graphqlFilters: Record<string, unknown> = {};

    for (const filter of filters) {
      const fieldName = this.mapFieldName(filter.field);

      switch (filter.lookup) {
        case 'exact':
          graphqlFilters[fieldName] = { eq: filter.value };
          break;
        case 'gt':
          graphqlFilters[fieldName] = { gt: filter.value };
          break;
        case 'gte':
          graphqlFilters[fieldName] = { gte: filter.value };
          break;
        case 'lt':
          graphqlFilters[fieldName] = { lt: filter.value };
          break;
        case 'lte':
          graphqlFilters[fieldName] = { lte: filter.value };
          break;
        case 'contains':
          graphqlFilters[fieldName] = { contains: filter.value };
          break;
        case 'icontains':
          graphqlFilters[fieldName] = { iContains: filter.value };
          break;
        case 'startswith':
          graphqlFilters[fieldName] = { startsWith: filter.value };
          break;
        case 'istartswith':
          graphqlFilters[fieldName] = { iStartsWith: filter.value };
          break;
        case 'endswith':
          graphqlFilters[fieldName] = { endsWith: filter.value };
          break;
        case 'iendswith':
          graphqlFilters[fieldName] = { iEndsWith: filter.value };
          break;
        case 'in':
          graphqlFilters[fieldName] = { in: filter.value };
          break;
        case 'isnull':
          graphqlFilters[fieldName] = { isNull: filter.value };
          break;
        default:
          // Default to exact match
          graphqlFilters[fieldName] = { eq: filter.value };
      }
    }

    return graphqlFilters;
  }

  private async executeGraphQL<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
    if (!this.connected) {
      throw new Error('GraphQLAdapter: Not connected. Call connect() first.');
    }

    const response = await this.fetchFn(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as GraphQLResponse<T>;

    if (result.errors && result.errors.length > 0) {
      const errorMessages = result.errors.map((e) => e.message).join(', ');
      throw new Error(`GraphQL errors: ${errorMessages}`);
    }

    if (!result.data) {
      throw new Error('GraphQL response missing data');
    }

    return result.data;
  }

  protected extractDataFromPath(data: unknown, path: string): unknown {
    if (!path) return data;

    const parts = path.split('.');
    let current: unknown = data;

    for (const part of parts) {
      if (typeof current === 'object' && current !== null && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Build create mutation query
   * Override this method to customize create mutations
   */
  protected buildCreateMutation<T>(
    model: ModelClass<T>,
    data: Record<string, unknown>
  ): {
    query: string;
    variables: Record<string, unknown>;
  } {
    // Check for custom query first
    if (this.customQueries?.create) {
      const input = this.buildInputVariables(data);
      return {
        query: this.customQueries.create,
        variables: { input },
      };
    }

    // Check for custom query builder
    if (this.queryBuilders?.create) {
      const fields = this.getFieldsFromModel(model);
      const query = this.queryBuilders.create.buildQuery(model, fields, data);
      const variables = this.queryBuilders.create.buildVariables?.(data) || { input: this.buildInputVariables(data) };
      return { query, variables };
    }

    // Default implementation
    const mutationName = this.getQueryName('create', model);
    const fields = this.buildFieldSelection(model);
    const input = this.buildInputVariables(data);

    const query = `
      mutation Create${model.name}($input: Create${model.name}Input!) {
        ${mutationName}(input: $input) {
          ${fields}
        }
      }
    `;

    return { query, variables: { input } };
  }

  /**
   * Build find/list query
   * Override this method to customize find queries
   */
  protected buildFindQuery<T>(
    model: ModelClass<T>,
    filters: Record<string, unknown>
  ): {
    query: string;
    variables: Record<string, unknown>;
  } {
    // Check for custom query first
    if (this.customQueries?.find) {
      return {
        query: this.customQueries.find,
        variables: { filters },
      };
    }

    // Check for custom query builder
    if (this.queryBuilders?.find) {
      const fields = this.getFieldsFromModel(model);
      const query = this.queryBuilders.find.buildQuery(model, fields, filters);
      const variables = this.queryBuilders.find.buildVariables?.(filters) || { filters };
      return { query, variables };
    }

    // Default implementation
    const queryName = this.getQueryName('list', model);
    const fields = this.buildFieldSelection(model);

    // Build basic filters (for simple exact matches)
    const graphqlFilters: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(filters)) {
      if (!key.startsWith('_')) {
        const mappedKey = this.mapFieldName(key);
        graphqlFilters[mappedKey] = { eq: value };
      }
    }

    const query = `
      query Get${model.name}s($filters: ${model.name}Filters) {
        ${queryName}(filters: $filters) {
          ${fields}
        }
      }
    `;

    return { query, variables: { filters: graphqlFilters } };
  }

  /**
   * Build update mutation query
   * Override this method to customize update mutations
   */
  protected buildUpdateMutation<T>(
    model: ModelClass<T>,
    id: unknown,
    data: Record<string, unknown>
  ): {
    query: string;
    variables: Record<string, unknown>;
  } {
    // Check for custom query first
    if (this.customQueries?.update) {
      const input = this.buildInputVariables(data);
      return {
        query: this.customQueries.update,
        variables: { id, input },
      };
    }

    // Check for custom query builder
    if (this.queryBuilders?.update) {
      const fields = this.getFieldsFromModel(model);
      const query = this.queryBuilders.update.buildQuery(model, fields, { id, ...data });
      const variables = this.queryBuilders.update.buildVariables?.({ id, ...data }) || {
        id,
        input: this.buildInputVariables(data),
      };
      return { query, variables };
    }

    // Default implementation
    const mutationName = this.getQueryName('update', model);
    const fields = this.buildFieldSelection(model);
    const input = this.buildInputVariables(data);

    const query = `
      mutation Update${model.name}($id: ID!, $input: Update${model.name}Input!) {
        ${mutationName}(id: $id, input: $input) {
          ${fields}
        }
      }
    `;

    return { query, variables: { id, input } };
  }

  /**
   * Build delete mutation query
   * Override this method to customize delete mutations
   */
  protected buildDeleteMutation<T>(
    model: ModelClass<T>,
    id: unknown
  ): {
    query: string;
    variables: Record<string, unknown>;
  } {
    // Check for custom query first
    if (this.customQueries?.delete) {
      return {
        query: this.customQueries.delete,
        variables: { id },
      };
    }

    // Check for custom query builder
    if (this.queryBuilders?.delete) {
      const query = this.queryBuilders.delete.buildQuery(model, [], { id });
      const variables = this.queryBuilders.delete.buildVariables?.({ id }) || { id };
      return { query, variables };
    }

    // Default implementation
    const mutationName = this.getQueryName('delete', model);

    const query = `
      mutation Delete${model.name}($id: ID!) {
        ${mutationName}(id: $id) {
          success
        }
      }
    `;

    return { query, variables: { id } };
  }

  /**
   * Build input variables for mutations
   * Override this method to customize input transformation
   */
  protected buildInputVariables(data: Record<string, unknown>): Record<string, unknown> {
    const input: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (key !== 'id' && !key.startsWith('_')) {
        input[this.mapFieldName(key)] = value;
      }
    }
    return input;
  }

  async connect(): Promise<void> {
    // Test connection with introspection query
    try {
      await this.fetchFn(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers,
        },
        body: JSON.stringify({
          query: '{ __schema { queryType { name } } }',
        }),
      });
      this.connected = true;
    } catch (error) {
      throw new Error(
        `Failed to connect to GraphQL endpoint: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async create<T>(model: ModelClass<T>, data: Record<string, unknown>): Promise<T> {
    const { query, variables } = this.buildCreateMutation(model, data);

    const result = await this.executeGraphQL<Record<string, unknown>>(query, variables);

    const mutationName = this.getQueryName('create', model);
    const path = this.responsePaths.create || mutationName;
    const rawData = this.extractDataFromPath(result, path);

    if (!rawData || typeof rawData !== 'object') {
      throw new Error('Invalid response from create mutation');
    }

    return (model.fromDB?.(rawData as Record<string, unknown>) as T) ?? (rawData as T);
  }

  async find<T>(model: ModelClass<T>, filters: Record<string, unknown>): Promise<T[]> {
    const { query, variables } = this.buildFindQuery(model, filters);

    const result = await this.executeGraphQL<Record<string, unknown>>(query, variables);

    const queryName = this.getQueryName('list', model);
    const path = this.responsePaths.list || queryName;
    const rawData = this.extractDataFromPath(result, path);

    if (!Array.isArray(rawData)) {
      throw new Error('Invalid response from list query');
    }

    return rawData.map((item) => (model.fromDB?.(item as Record<string, unknown>) as T) ?? (item as T));
  }

  async update<T>(
    model: ModelClass<T>,
    filters: Record<string, unknown>,
    data: Record<string, unknown>
  ): Promise<void> {
    // Assume primary key is in filters
    const id = filters.id;
    if (!id) {
      throw new Error('Update requires id in filters');
    }

    const { query, variables } = this.buildUpdateMutation(model, id, data);

    await this.executeGraphQL(query, variables);
  }

  async delete<T>(model: ModelClass<T>, filters: Record<string, unknown>): Promise<void> {
    // Assume primary key is in filters
    const id = filters.id;
    if (!id) {
      throw new Error('Delete requires id in filters');
    }

    const { query, variables } = this.buildDeleteMutation(model, id);

    await this.executeGraphQL(query, variables);
  }

  /**
   * Get a single record by ID
   */
  async get<T>(model: ModelClass<T>, id: unknown): Promise<T | null> {
    const results = await this.find(model, { id });
    return results.length > 0 ? results[0]! : null;
  }

  /**
   * List records with query plan
   */
  async list<T>(model: ModelClass<T>, plan: QueryPlan): Promise<T[]> {
    // Convert QueryPlan filters to simple filter object
    const filters: Record<string, unknown> = {};
    for (const filter of plan.filters || []) {
      // Simple exact match for now
      if (filter.lookup === 'exact') {
        filters[filter.field] = filter.value;
      } else {
        // Use Django-style lookup syntax
        filters[`${filter.field}__${filter.lookup}`] = filter.value;
      }
    }
    return this.find(model, filters);
  }

  async count<T>(model: ModelClass<T>, query: QueryPlan): Promise<number> {
    const queryName = this.getQueryName('list', model);

    const graphqlFilters = this.buildFiltersVariable(query.filters);

    const countQuery = `
      query Count${model.name}s($filters: ${model.name}Filters) {
        ${queryName}(filters: $filters) {
          totalCount
        }
      }
    `;

    const result = await this.executeGraphQL<Record<string, unknown>>(countQuery, {
      filters: graphqlFilters,
    });

    const path = this.responsePaths.list || queryName;
    const data = this.extractDataFromPath(result, path);

    if (typeof data === 'object' && data !== null && 'totalCount' in data) {
      return (data as { totalCount: number }).totalCount;
    }

    throw new Error('Invalid response from count query');
  }

  async exists<T>(model: ModelClass<T>, query: QueryPlan<T>): Promise<boolean> {
    const count = await this.count(model, query);
    return count > 0;
  }
}
