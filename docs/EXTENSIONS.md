# Extensions & Schema Generation

Guide to extending ORM.js and generating schemas from models.

## Table of Contents

- [Overview](#overview)
- [Schema Generation](#schema-generation)
- [Validation Libraries](#validation-libraries)
- [API Documentation](#api-documentation)
- [Type Generation](#type-generation)
- [Custom Field Types](#custom-field-types)
- [Plugins](#plugins)

## Overview

ORM.js core is intentionally minimal and dependency-free. Extended functionality (like schema generation for Zod, Yup, OpenAPI, etc.) is provided through separate packages to avoid bloat.

### Philosophy

- **Core is lean**: No dependencies beyond essential TypeScript types
- **Extensions are opt-in**: Install only what you need
- **Easy to extend**: Well-defined APIs for creating extensions
- **Type-safe**: Extensions leverage TypeScript for great DX

## Schema Generation

### Metadata API

Models expose metadata that extensions can use:

```typescript
class User extends Model {
  name = new CharField({ maxLength: 100 });
  email = new CharField({ maxLength: 255 });
  age = new IntegerField({ min: 0, max: 150, required: false });
}

// Access metadata
User.meta.fields.forEach((field, name) => {
  console.log(name, field.constructor.name, field.required);
});

// Output:
// name CharField true
// email CharField true
// age IntegerField false
```

### Field Metadata Interface

```typescript
interface Field<T = any> {
  required: boolean;
  default?: T | (() => T);
  validators: Validator[];
  choices?: T[];

  // Field-specific metadata
  maxLength?: number;  // CharField, TextField
  minLength?: number;
  min?: number;        // IntegerField, FloatField
  max?: number;
  precision?: number;  // FloatField

  // Introspection
  getType(): string;
  getMetadata(): FieldMetadata;
}
```

## Validation Libraries

### Zod (@orm-js/zod)

Generate Zod schemas from models:

```typescript
import { generateZodSchema } from '@orm-js/zod';

class User extends Model {
  name = new CharField({ maxLength: 100 });
  email = new CharField({ maxLength: 255 });
  age = new IntegerField({ min: 0, max: 150, required: false });
  role = new ChoiceField({ choices: ['admin', 'user', 'guest'] });
}

// Generate Zod schema
const UserSchema = generateZodSchema(User);

// Use for validation
const result = UserSchema.safeParse({
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
  role: 'admin',
});

if (result.success) {
  console.log('Valid!', result.data);
} else {
  console.log('Errors:', result.error);
}
```

**Implementation:**

```typescript
// @orm-js/zod package
import { z } from 'zod';
import { Model, CharField, IntegerField, Field } from 'orm-js';

export function generateZodSchema<T extends Model>(
  modelClass: typeof Model
): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};

  modelClass.meta.fields.forEach((field, name) => {
    shape[name] = fieldToZod(field);
  });

  return z.object(shape);
}

function fieldToZod(field: Field): z.ZodTypeAny {
  let schema: z.ZodTypeAny;

  // Map field types to Zod types
  if (field instanceof CharField) {
    schema = z.string();

    if (field.maxLength) {
      schema = schema.max(field.maxLength);
    }
    if (field.minLength) {
      schema = schema.min(field.minLength);
    }
  } else if (field instanceof IntegerField) {
    schema = z.number().int();

    if (field.min !== undefined) {
      schema = schema.min(field.min);
    }
    if (field.max !== undefined) {
      schema = schema.max(field.max);
    }
  } else if (field instanceof BooleanField) {
    schema = z.boolean();
  } else if (field instanceof DateTimeField) {
    schema = z.date();
  } else if (field instanceof ChoiceField) {
    schema = z.enum(field.choices as any);
  } else {
    // Generic fallback
    schema = z.any();
  }

  // Handle optional fields
  if (!field.required) {
    schema = schema.optional();
  }

  // Handle default values
  if (field.default !== undefined) {
    schema = schema.default(
      typeof field.default === 'function'
        ? field.default()
        : field.default
    );
  }

  return schema;
}
```

**Usage in React forms:**

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { generateZodSchema } from '@orm-js/zod';

function UserForm() {
  const UserSchema = generateZodSchema(User);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(UserSchema),
  });

  const onSubmit = async (data) => {
    await User.objects.create(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('name')} />
      {errors.name && <span>{errors.name.message}</span>}

      <input {...register('email')} />
      {errors.email && <span>{errors.email.message}</span>}

      <button type="submit">Save</button>
    </form>
  );
}
```

### Yup (@orm-js/yup)

Similar to Zod but for Yup:

```typescript
import { generateYupSchema } from '@orm-js/yup';

const UserSchema = generateYupSchema(User);

// Validate
try {
  const validated = await UserSchema.validate(data);
} catch (error) {
  console.log(error.errors);
}
```

### Joi (@orm-js/joi)

```typescript
import { generateJoiSchema } from '@orm-js/joi';

const UserSchema = generateJoiSchema(User);

const { error, value } = UserSchema.validate(data);
```

## API Documentation

### OpenAPI/Swagger (@orm-js/openapi)

Generate OpenAPI schemas:

```typescript
import { generateOpenAPISchema } from '@orm-js/openapi';

class User extends Model {
  static meta = {
    description: 'User account',
  };

  name = new CharField({
    maxLength: 100,
    description: 'Full name',
  });

  email = new CharField({
    maxLength: 255,
    description: 'Email address',
    example: 'user@example.com',
  });
}

// Generate OpenAPI schema
const openapi = generateOpenAPISchema([User, Post, Comment], {
  info: {
    title: 'My API',
    version: '1.0.0',
  },
  servers: [
    { url: 'https://api.example.com' },
  ],
});

// Output OpenAPI JSON
console.log(JSON.stringify(openapi, null, 2));
```

**Output:**

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "My API",
    "version": "1.0.0"
  },
  "components": {
    "schemas": {
      "User": {
        "type": "object",
        "description": "User account",
        "properties": {
          "id": { "type": "integer" },
          "name": {
            "type": "string",
            "maxLength": 100,
            "description": "Full name"
          },
          "email": {
            "type": "string",
            "maxLength": 255,
            "format": "email",
            "description": "Email address",
            "example": "user@example.com"
          }
        },
        "required": ["name", "email"]
      }
    }
  },
  "paths": {
    "/users": {
      "get": {
        "summary": "List users",
        "responses": {
          "200": {
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": { "$ref": "#/components/schemas/User" }
                }
              }
            }
          }
        }
      },
      "post": {
        "summary": "Create user",
        "requestBody": {
          "content": {
            "application/json": {
              "schema": { "$ref": "#/components/schemas/User" }
            }
          }
        }
      }
    }
  }
}
```

### GraphQL Schema (@orm-js/graphql-schema)

Generate GraphQL type definitions:

```typescript
import { generateGraphQLSchema } from '@orm-js/graphql-schema';

class User extends Model {
  name = new CharField({ maxLength: 100 });
  email = new CharField({ maxLength: 255 });
  posts = new ForeignKey(Post, { relatedName: 'author' });
}

class Post extends Model {
  title = new CharField({ maxLength: 200 });
  content = new TextField();
  author = new ForeignKey(User);
}

// Generate schema
const typeDefs = generateGraphQLSchema([User, Post]);

console.log(typeDefs);
```

**Output:**

```graphql
type User {
  id: ID!
  name: String!
  email: String!
  posts: [Post!]!
}

type Post {
  id: ID!
  title: String!
  content: String!
  author: User!
}

type Query {
  user(id: ID!): User
  users(
    limit: Int
    offset: Int
    orderBy: String
  ): [User!]!

  post(id: ID!): Post
  posts(
    limit: Int
    offset: Int
    orderBy: String
  ): [Post!]!
}

type Mutation {
  createUser(input: UserInput!): User!
  updateUser(id: ID!, input: UserInput!): User!
  deleteUser(id: ID!): Boolean!

  createPost(input: PostInput!): Post!
  updatePost(id: ID!, input: PostInput!): Post!
  deletePost(id: ID!): Boolean!
}

input UserInput {
  name: String!
  email: String!
}

input PostInput {
  title: String!
  content: String!
  authorId: ID!
}
```

## Type Generation

### TypeScript Interfaces (@orm-js/codegen)

Generate TypeScript interfaces from runtime models:

```typescript
import { generateTypeScript } from '@orm-js/codegen';

const code = generateTypeScript([User, Post]);

// Output to file
import fs from 'fs';
fs.writeFileSync('models.d.ts', code);
```

**Output:**

```typescript
export interface User {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Post {
  id: number;
  title: string;
  content: string;
  authorId: number;
  author?: User;
  createdAt: Date;
  updatedAt: Date;
}
```

### JSON Schema (@orm-js/json-schema)

```typescript
import { generateJSONSchema } from '@orm-js/json-schema';

const schema = generateJSONSchema(User);

console.log(JSON.stringify(schema, null, 2));
```

**Output:**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "id": { "type": "integer" },
    "name": { "type": "string", "maxLength": 100 },
    "email": { "type": "string", "maxLength": 255, "format": "email" },
    "age": { "type": "integer", "minimum": 0, "maximum": 150 }
  },
  "required": ["name", "email"],
  "additionalProperties": false
}
```

## Custom Field Types

Create custom fields with proper metadata:

```typescript
import { CharField, Field } from 'orm-js';

// Email field with built-in validation
class EmailField extends CharField {
  constructor(options = {}) {
    super({
      ...options,
      maxLength: options.maxLength || 255,
      validators: [
        ...(options.validators || []),
        emailValidator,
      ],
    });
  }

  getMetadata() {
    return {
      ...super.getMetadata(),
      type: 'email',
      format: 'email',  // For OpenAPI
    };
  }
}

// URL field
class URLField extends CharField {
  constructor(options = {}) {
    super({
      ...options,
      maxLength: options.maxLength || 2000,
      validators: [
        ...(options.validators || []),
        urlValidator,
      ],
    });
  }

  getMetadata() {
    return {
      ...super.getMetadata(),
      type: 'url',
      format: 'uri',
    };
  }
}

// Phone field
class PhoneField extends CharField {
  constructor(options = {}) {
    super({
      ...options,
      maxLength: 20,
      validators: [phoneValidator],
    });
  }

  getMetadata() {
    return {
      ...super.getMetadata(),
      type: 'phone',
      pattern: '^\\+?[1-9]\\d{1,14}$',  // E.164 format
    };
  }
}

// Usage
class User extends Model {
  email = new EmailField({ required: true });
  website = new URLField({ required: false });
  phone = new PhoneField({ required: false });
}

// Schema generation automatically picks up custom metadata
const zodSchema = generateZodSchema(User);
// email: z.string().email()
// website: z.string().url().optional()
// phone: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional()
```

## Plugins

### Plugin System

Create plugins to extend ORM functionality:

```typescript
// Define plugin interface
interface ORMPlugin {
  name: string;
  install(orm: typeof ORM): void;
}

// Example: Soft delete plugin
class SoftDeletePlugin implements ORMPlugin {
  name = 'soft-delete';

  install(orm: typeof ORM) {
    // Add deleted field to all models
    orm.Model.addField('deleted', new BooleanField({ default: false }));
    orm.Model.addField('deletedAt', new DateTimeField({ required: false }));

    // Override delete method
    const originalDelete = orm.Model.prototype.delete;
    orm.Model.prototype.delete = async function() {
      this.deleted = true;
      this.deletedAt = new Date();
      await this.save();
    };

    // Filter deleted by default
    const originalAll = orm.Manager.prototype.all;
    orm.Manager.prototype.all = function() {
      return originalAll.call(this).filter({ deleted: false });
    };

    // Add method to include deleted
    orm.Manager.prototype.withDeleted = function() {
      return originalAll.call(this);
    };
  }
}

// Use plugin
import { ORM } from 'orm-js';

ORM.use(new SoftDeletePlugin());

// Now all models have soft delete
const user = await User.objects.get({ id: 1 });
await user.delete();  // Soft delete

// Query excludes deleted by default
await User.objects.all();  // Only non-deleted

// Include deleted
await User.objects.withDeleted().all();
```

### Example Plugins

#### Timestamps Plugin

```typescript
class TimestampsPlugin implements ORMPlugin {
  name = 'timestamps';

  install(orm: typeof ORM) {
    // Add timestamp fields
    orm.Model.addField('createdAt', new DateTimeField({ autoNowAdd: true }));
    orm.Model.addField('updatedAt', new DateTimeField({ autoNow: true }));
  }
}
```

#### Paranoid Plugin (Soft Delete + Restore)

```typescript
class ParanoidPlugin implements ORMPlugin {
  name = 'paranoid';

  install(orm: typeof ORM) {
    orm.Model.addField('deletedAt', new DateTimeField({ required: false }));

    // Override delete
    orm.Model.prototype.delete = async function() {
      this.deletedAt = new Date();
      await this.save();
    };

    // Add restore
    orm.Model.prototype.restore = async function() {
      this.deletedAt = null;
      await this.save();
    };

    // Filter in queries
    orm.Manager.prototype.all = function() {
      return originalAll.call(this).filter({ deletedAt__isnull: true });
    };
  }
}
```

#### Audit Plugin

```typescript
class AuditPlugin implements ORMPlugin {
  name = 'audit';

  install(orm: typeof ORM) {
    // Log all changes
    signal(SignalType.POST_SAVE).connect(async (sender, instance, created) => {
      await AuditLog.objects.create({
        model: sender.name,
        modelId: instance.id,
        action: created ? 'create' : 'update',
        changes: instance.toJSON(),
      });
    });

    signal(SignalType.POST_DELETE).connect(async (sender, instance) => {
      await AuditLog.objects.create({
        model: sender.name,
        modelId: instance.id,
        action: 'delete',
        changes: instance.toJSON(),
      });
    });
  }
}
```

## Creating Extension Packages

### Package Structure

```
@orm-js/zod/
├── src/
│   └── index.ts
├── package.json
├── tsconfig.json
└── README.md
```

### package.json

```json
{
  "name": "@orm-js/zod",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "peerDependencies": {
    "orm-js": "^1.0.0",
    "zod": "^3.0.0"
  },
  "keywords": ["orm-js", "zod", "validation"]
}
```

### Implementation Template

```typescript
import { Model, Field } from 'orm-js';

export function generateSchema<T extends Model>(
  modelClass: typeof Model
): YourSchemaType {
  const schema = {};

  // Iterate over fields
  modelClass.meta.fields.forEach((field, name) => {
    schema[name] = convertField(field);
  });

  return schema;
}

function convertField(field: Field): YourFieldType {
  // Map ORM field to your schema type
  // Use field.getMetadata() for introspection
}
```

## Best Practices

1. **Keep extensions focused**: One extension = one purpose
2. **Use peerDependencies**: Don't bundle orm-js or validation libs
3. **Provide TypeScript types**: Export proper types
4. **Document thoroughly**: Examples and API reference
5. **Test extensively**: Test with various field types and configurations
6. **Version carefully**: Follow semantic versioning
7. **Namespace properly**: Use @orm-js/* for official, own namespace for community

## Official Extensions (Planned)

- `@orm-js/zod` - Zod schema generation
- `@orm-js/yup` - Yup schema generation
- `@orm-js/openapi` - OpenAPI/Swagger documentation
- `@orm-js/graphql-schema` - GraphQL schema generation
- `@orm-js/json-schema` - JSON Schema generation
- `@orm-js/codegen` - TypeScript/JavaScript code generation
- `@orm-js/forms` - Form library integrations (React Hook Form, Formik)
- `@orm-js/admin` - Auto-generated admin interface
