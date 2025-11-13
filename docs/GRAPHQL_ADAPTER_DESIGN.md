# GraphQL Adapter Design

## Overview

GraphQLAdapter allows the ORM to work with GraphQL APIs, translating ORM operations into GraphQL queries and mutations.

## Architecture

```
┌─────────────────┐
│   Model/QS      │
│   Operations    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ GraphQLAdapter  │
├─────────────────┤
│ • Query builder │
│ • Mutation gen  │
│ • Schema map    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  GraphQL API    │
│   Endpoint      │
└─────────────────┘
```

## Key Components

### 1. GraphQLAdapter Class

Implements `BackendAdapter` interface:

```typescript
interface GraphQLAdapterOptions {
  endpoint: string;
  headers?: Record<string, string>;

  // Schema mapping
  queryNames?: {
    list?: string;      // e.g., 'users' for User.objects.all()
    get?: string;       // e.g., 'user' for User.objects.get()
    create?: string;    // e.g., 'createUser'
    update?: string;    // e.g., 'updateUser'
    delete?: string;    // e.g., 'deleteUser'
  };

  // Field mapping
  fieldMapping?: Record<string, string>;  // ORM field -> GraphQL field

  // Response paths
  responsePaths?: {
    list?: string;      // e.g., 'data.users.nodes'
    get?: string;       // e.g., 'data.user'
    create?: string;    // e.g., 'data.createUser.user'
    update?: string;    // e.g., 'data.updateUser.user'
    delete?: string;    // e.g., 'data.deleteUser.success'
  };
}
```

### 2. Query Generation

**List Query:**
```graphql
query GetUsers($filters: UserFilters, $limit: Int, $offset: Int) {
  users(filters: $filters, limit: $limit, offset: $offset) {
    nodes {
      id
      name
      email
      createdAt
    }
    totalCount
  }
}
```

**Get Query:**
```graphql
query GetUser($id: ID!) {
  user(id: $id) {
    id
    name
    email
    createdAt
  }
}
```

**Create Mutation:**
```graphql
mutation CreateUser($input: CreateUserInput!) {
  createUser(input: $input) {
    user {
      id
      name
      email
      createdAt
    }
  }
}
```

**Update Mutation:**
```graphql
mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {
  updateUser(id: $id, input: $input) {
    user {
      id
      name
      email
      createdAt
    }
  }
}
```

**Delete Mutation:**
```graphql
mutation DeleteUser($id: ID!) {
  deleteUser(id: $id) {
    success
  }
}
```

### 3. Filter Mapping

ORM lookups to GraphQL filters:

| ORM Lookup | GraphQL Filter |
|------------|----------------|
| `field` | `{ field: { eq: value } }` |
| `field__exact` | `{ field: { eq: value } }` |
| `field__gt` | `{ field: { gt: value } }` |
| `field__gte` | `{ field: { gte: value } }` |
| `field__lt` | `{ field: { lt: value } }` |
| `field__lte` | `{ field: { lte: value } }` |
| `field__contains` | `{ field: { contains: value } }` |
| `field__icontains` | `{ field: { iContains: value } }` |
| `field__startswith` | `{ field: { startsWith: value } }` |
| `field__endswith` | `{ field: { endsWith: value } }` |
| `field__in` | `{ field: { in: value } }` |
| `field__isnull` | `{ field: { isNull: value } }` |

### 4. Schema Introspection (Optional)

Support GraphQL introspection to auto-generate queries:

```typescript
async introspect(): Promise<SchemaInfo> {
  const query = `
    query IntrospectionQuery {
      __schema {
        queryType { name }
        mutationType { name }
        types {
          name
          fields {
            name
            type { name kind }
          }
        }
      }
    }
  `;
  // Parse and return schema info
}
```

## Implementation Plan

### Phase 1: Basic CRUD ✅

1. ✅ Create GraphQLAdapter class
2. ✅ Implement connect/disconnect
3. ✅ Implement create (mutation)
4. ✅ Implement find (query with filters)
5. ✅ Implement update (mutation)
6. ✅ Implement delete (mutation)
7. ✅ Basic field mapping
8. ✅ Response parsing

### Phase 2: Advanced Features

1. Query optimization
   - Field selection (only request needed fields)
   - Batch queries with aliases
2. Filter translation
   - All 18 lookup types
   - Complex filters (AND/OR)
3. Pagination support
   - Cursor-based pagination
   - Offset-based pagination
4. Relationships
   - select_related (nested queries)
   - prefetch_related (separate queries)
5. Error handling
   - GraphQL errors
   - Network errors
   - Validation errors

### Phase 3: Advanced GraphQL Features

1. Subscriptions
2. Fragments
3. Custom scalars
4. File uploads
5. Caching strategies

## Example Usage

```typescript
import { GraphQLAdapter } from '@orm-js/adapter-graphql';
import { Model, CharField, IntegerField } from 'orm-js';

// Define model
class User extends Model {
  declare id?: number;
  declare name: string;
  declare email: string;
  declare age: number;
  static objects: Manager<User>;
}

User.init({
  name: new CharField({ maxLength: 100 }),
  email: new CharField({ maxLength: 255 }),
  age: new IntegerField(),
});

// Create adapter
const adapter = new GraphQLAdapter({
  endpoint: 'https://api.example.com/graphql',
  headers: {
    'Authorization': 'Bearer token',
  },
  queryNames: {
    list: 'users',
    get: 'user',
    create: 'createUser',
    update: 'updateUser',
    delete: 'deleteUser',
  },
  responsePaths: {
    list: 'users.nodes',
    get: 'user',
    create: 'createUser.user',
    update: 'updateUser.user',
  },
});

// Set adapter
User.setAdapter(adapter);
User.objects = new Manager(User, adapter);

// Use ORM
await adapter.connect();

// Create
const user = await User.objects.create({
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
});

// Find
const users = await User.objects.filter({ age__gte: 25 }).all();

// Update
user.age = 31;
await user.save();

// Delete
await user.delete();

await adapter.disconnect();
```

## Testing Strategy

1. **Unit Tests**
   - Query generation
   - Filter translation
   - Response parsing
   - Error handling

2. **Integration Tests**
   - Mock GraphQL server
   - Full CRUD operations
   - Complex queries
   - Relationship loading

3. **E2E Tests** (optional)
   - Real GraphQL API
   - Performance tests

## Considerations

### Flexibility

Different GraphQL APIs have different conventions:
- Query/mutation names
- Filter syntax
- Response structure
- Pagination approach

The adapter should be configurable to work with various APIs.

### Performance

- Minimize over-fetching (request only needed fields)
- Batch operations when possible
- Cache introspection results
- Connection pooling

### Error Handling

- Network errors → ConnectionError
- GraphQL errors → adapt to ORM errors
- Validation errors → ValidationError

## Future Enhancements

1. GraphQL Code Generator integration
2. Auto-generate TypeScript types from schema
3. Optimistic updates
4. Real-time subscriptions
5. Apollo Client integration
6. Relay-style pagination
