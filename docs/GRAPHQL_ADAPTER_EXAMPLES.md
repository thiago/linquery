# GraphQL Adapter - Customization Examples

O GraphQLAdapter foi projetado para ser extensível de várias formas. Aqui estão exemplos práticos de customização.

## Índice

1. [Usando Custom Queries](#1-usando-custom-queries)
2. [Usando Query Builders](#2-usando-query-builders)
3. [Estendendo o Adapter](#3-estendendo-o-adapter)
4. [Customizando Field Mapping](#4-customizando-field-mapping)
5. [Exemplo Completo: Hasura](#5-exemplo-completo-hasura)

## 1. Usando Custom Queries

A forma mais simples de customizar é fornecer queries/mutations prontas:

```typescript
import { GraphQLAdapter } from 'orm-js';

const adapter = new GraphQLAdapter({
  endpoint: 'https://api.example.com/graphql',

  // Queries customizadas têm prioridade máxima
  customQueries: {
    create: `
      mutation CreateUser($input: UserInput!) {
        insert_users_one(object: $input) {
          id
          name
          email
          created_at
        }
      }
    `,
    find: `
      query GetUsers($filters: UsersFilters) {
        users(where: $filters) {
          id
          name
          email
          created_at
        }
      }
    `,
    update: `
      mutation UpdateUser($id: ID!, $input: UserSetInput!) {
        update_users_by_pk(
          pk_columns: { id: $id }
          _set: $input
        ) {
          id
          name
          email
          updated_at
        }
      }
    `,
  },

  // Ajuste os paths de resposta conforme sua API
  responsePaths: {
    create: 'insert_users_one',
    find: 'users',
    update: 'update_users_by_pk',
  },
});
```

## 2. Usando Query Builders

Para mais controle, use query builders customizados:

```typescript
import { GraphQLAdapter, QueryBuilder, ModelClass } from 'orm-js';

// Query builder personalizado para Hasura
const hasuraCreateBuilder: QueryBuilder = {
  buildQuery(model, fields, data) {
    return `
      mutation Insert${model.name}($object: ${model.name.toLowerCase()}_insert_input!) {
        insert_${model.name.toLowerCase()}_one(object: $object) {
          ${fields.join('\n          ')}
        }
      }
    `;
  },

  buildVariables(data) {
    // Transforma os dados conforme necessário
    return {
      object: {
        ...data,
        // Adiciona campos extras ou transforma valores
        created_at: new Date().toISOString(),
      },
    };
  },
};

// Query builder para busca com filtros complexos
const hasuraFindBuilder: QueryBuilder = {
  buildQuery(model, fields, filters) {
    return `
      query Get${model.name}s($where: ${model.name.toLowerCase()}_bool_exp) {
        ${model.name.toLowerCase()}(where: $where) {
          ${fields.join('\n          ')}
        }
      }
    `;
  },

  buildVariables(filters) {
    // Converte filtros ORM para Hasura
    const where: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(filters)) {
      // Converte age__gte para { age: { _gte: value } }
      const [field, lookup] = key.split('__');

      if (lookup) {
        where[field] = { [`_${lookup}`]: value };
      } else {
        where[field] = { _eq: value };
      }
    }

    return { where };
  },
};

const adapter = new GraphQLAdapter({
  endpoint: 'https://hasura.example.com/v1/graphql',

  queryBuilders: {
    create: hasuraCreateBuilder,
    find: hasuraFindBuilder,
  },

  responsePaths: {
    create: `insert_users_one`,
    find: 'users',
  },
});
```

## 3. Estendendo o Adapter

Para máximo controle, estenda a classe:

```typescript
import { GraphQLAdapter, ModelClass } from 'orm-js';

class HasuraAdapter extends GraphQLAdapter {
  /**
   * Override buildCreateMutation para Hasura
   */
  protected buildCreateMutation<T>(
    model: ModelClass<T>,
    data: Record<string, unknown>
  ): { query: string; variables: Record<string, unknown> } {
    const tableName = this.getTableName(model);
    const fields = this.buildFieldSelection(model);

    // Adiciona timestamp automaticamente
    const object = {
      ...this.buildInputVariables(data),
      created_at: new Date().toISOString(),
    };

    const query = `
      mutation Insert${model.name}($object: ${tableName}_insert_input!) {
        insert_${tableName}_one(object: $object) {
          ${fields}
        }
      }
    `;

    return { query, variables: { object } };
  }

  /**
   * Override buildFindQuery para suportar filtros Hasura
   */
  protected buildFindQuery<T>(
    model: ModelClass<T>,
    filters: Record<string, unknown>
  ): { query: string; variables: Record<string, unknown> } {
    const tableName = this.getTableName(model);
    const fields = this.buildFieldSelection(model);

    // Converte filtros ORM para Hasura
    const where = this.buildHasuraFilters(filters);

    const query = `
      query Get${model.name}s($where: ${tableName}_bool_exp) {
        ${tableName}(where: $where) {
          ${fields}
        }
      }
    `;

    return { query, variables: { where } };
  }

  /**
   * Override buildUpdateMutation para Hasura
   */
  protected buildUpdateMutation<T>(
    model: ModelClass<T>,
    id: unknown,
    data: Record<string, unknown>
  ): { query: string; variables: Record<string, unknown> } {
    const tableName = this.getTableName(model);
    const fields = this.buildFieldSelection(model);

    const _set = {
      ...this.buildInputVariables(data),
      updated_at: new Date().toISOString(),
    };

    const query = `
      mutation Update${model.name}($id: Int!, $_set: ${tableName}_set_input!) {
        update_${tableName}_by_pk(
          pk_columns: { id: $id }
          _set: $_set
        ) {
          ${fields}
        }
      }
    `;

    return { query, variables: { id, _set } };
  }

  /**
   * Método helper para pegar nome da tabela
   */
  private getTableName(model: ModelClass): string {
    // Você pode pegar do model.getMeta() ou usar o nome
    return model.name.toLowerCase() + 's';
  }

  /**
   * Converte filtros ORM para formato Hasura
   */
  private buildHasuraFilters(filters: Record<string, unknown>): Record<string, unknown> {
    const where: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(filters)) {
      const [field, lookup] = key.split('__');

      if (!lookup) {
        where[field] = { _eq: value };
      } else {
        const hasuraOp = this.mapLookupToHasura(lookup);
        where[field] = { [hasuraOp]: value };
      }
    }

    return where;
  }

  /**
   * Mapeia lookups ORM para operadores Hasura
   */
  private mapLookupToHasura(lookup: string): string {
    const map: Record<string, string> = {
      gt: '_gt',
      gte: '_gte',
      lt: '_lt',
      lte: '_lte',
      exact: '_eq',
      in: '_in',
      contains: '_like',
      icontains: '_ilike',
      startswith: '_like',
      endswith: '_like',
      isnull: '_is_null',
    };

    return map[lookup] || '_eq';
  }
}

// Uso
const adapter = new HasuraAdapter({
  endpoint: 'https://hasura.example.com/v1/graphql',
  headers: {
    'x-hasura-admin-secret': 'your-secret',
  },
});
```

## 4. Customizando Field Mapping

Mapeie campos ORM para campos GraphQL:

```typescript
const adapter = new GraphQLAdapter({
  endpoint: 'https://api.example.com/graphql',

  // Mapeia nomes de campos
  fieldMapping: {
    // ORM field -> GraphQL field
    name: 'fullName',
    email: 'emailAddress',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },

  queryNames: {
    list: 'allUsers',
    create: 'addUser',
    update: 'modifyUser',
    delete: 'removeUser',
  },
});

// Agora user.name será mapeado para fullName no GraphQL
await User.objects.create({
  name: 'John',  // Enviado como fullName
  email: 'john@example.com',  // Enviado como emailAddress
});
```

## 5. Exemplo Completo: Hasura

Um adapter completo para Hasura com todos os recursos:

```typescript
import { GraphQLAdapter, ModelClass, CompiledFilter } from 'orm-js';

export class HasuraAdapter extends GraphQLAdapter {
  constructor(options: {
    endpoint: string;
    adminSecret?: string;
    headers?: Record<string, string>;
  }) {
    super({
      endpoint: options.endpoint,
      headers: {
        'x-hasura-admin-secret': options.adminSecret || '',
        ...options.headers,
      },
    });
  }

  protected buildCreateMutation<T>(
    model: ModelClass<T>,
    data: Record<string, unknown>
  ) {
    const table = this.getTableName(model);
    const fields = this.getFieldsFromModel(model);

    const object = {
      ...data,
      created_at: new Date().toISOString(),
    };

    // Remove id se presente (Hasura gera automaticamente)
    delete object.id;

    return {
      query: `
        mutation InsertOne($object: ${table}_insert_input!) {
          insert_${table}_one(object: $object) {
            ${fields.join('\n            ')}
          }
        }
      `,
      variables: { object },
    };
  }

  protected buildFindQuery<T>(
    model: ModelClass<T>,
    filters: Record<string, unknown>
  ) {
    const table = this.getTableName(model);
    const fields = this.getFieldsFromModel(model);

    return {
      query: `
        query Find($where: ${table}_bool_exp) {
          ${table}(where: $where) {
            ${fields.join('\n            ')}
          }
        }
      `,
      variables: {
        where: this.convertFiltersToHasura(filters),
      },
    };
  }

  protected buildUpdateMutation<T>(
    model: ModelClass<T>,
    id: unknown,
    data: Record<string, unknown>
  ) {
    const table = this.getTableName(model);
    const fields = this.getFieldsFromModel(model);

    const _set = {
      ...data,
      updated_at: new Date().toISOString(),
    };

    return {
      query: `
        mutation UpdateByPk($id: Int!, $_set: ${table}_set_input!) {
          update_${table}_by_pk(
            pk_columns: { id: $id }
            _set: $_set
          ) {
            ${fields.join('\n            ')}
          }
        }
      `,
      variables: { id, _set },
    };
  }

  protected buildDeleteMutation<T>(model: ModelClass<T>, id: unknown) {
    const table = this.getTableName(model);

    return {
      query: `
        mutation DeleteByPk($id: Int!) {
          delete_${table}_by_pk(id: $id) {
            id
          }
        }
      `,
      variables: { id },
    };
  }

  private getTableName(model: ModelClass): string {
    // Pluraliza nome do model (simplificado)
    return model.name.toLowerCase() + 's';
  }

  private convertFiltersToHasura(filters: Record<string, unknown>): Record<string, unknown> {
    const where: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(filters)) {
      if (key.includes('__')) {
        const [field, lookup] = key.split('__');
        where[field] = this.buildHasuraCondition(lookup, value);
      } else {
        where[key] = { _eq: value };
      }
    }

    return where;
  }

  private buildHasuraCondition(lookup: string, value: unknown): Record<string, unknown> {
    const map: Record<string, string> = {
      exact: '_eq',
      gt: '_gt',
      gte: '_gte',
      lt: '_lt',
      lte: '_lte',
      in: '_in',
      contains: '_like',
      icontains: '_ilike',
      startswith: '_like',
      endswith: '_like',
      isnull: '_is_null',
    };

    const op = map[lookup] || '_eq';

    // Transforma valores para Hasura
    if (lookup === 'contains' || lookup === 'startswith') {
      return { [op]: `%${value}%` };
    } else if (lookup === 'endswith') {
      return { [op]: `%${value}` };
    }

    return { [op]: value };
  }
}

// Uso
const adapter = new HasuraAdapter({
  endpoint: 'https://my-app.hasura.app/v1/graphql',
  adminSecret: process.env.HASURA_ADMIN_SECRET,
});

User.setAdapter(adapter);

// Agora funciona com sintaxe Hasura automaticamente!
const users = await User.objects
  .filter({ age__gte: 18, name__icontains: 'john' })
  .toArray();
```

## Resumo de Extensibilidade

O GraphQLAdapter oferece 3 níveis de customização:

1. **Custom Queries** (mais simples): Forneça queries/mutations prontas
2. **Query Builders** (intermediário): Gere queries dinamicamente
3. **Herança** (mais poderoso): Sobrescreva métodos protegidos

Escolha o nível adequado para seu caso de uso!
