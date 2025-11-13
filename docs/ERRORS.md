# Error Handling

Complete guide to error types and error handling in ORM.js.

## Table of Contents

- [Error Hierarchy](#error-hierarchy)
- [Core Errors](#core-errors)
- [Validation Errors](#validation-errors)
- [Query Errors](#query-errors)
- [Relationship Errors](#relationship-errors)
- [Adapter Errors](#adapter-errors)
- [Sync Errors](#sync-errors)
- [Handling Errors](#handling-errors)
- [Custom Errors](#custom-errors)
- [Best Practices](#best-practices)

## Error Hierarchy

```
Error (built-in)
└── ORMError (base for all ORM errors)
    ├── ValidationError
    │   ├── FieldValidationError
    │   └── ModelValidationError
    ├── QueryError
    │   ├── DoesNotExist
    │   ├── MultipleObjectsReturned
    │   └── InvalidQueryError
    ├── RelationshipError
    │   ├── RelatedObjectDoesNotExist
    │   └── InvalidRelationshipError
    ├── AdapterError
    │   ├── ConnectionError
    │   ├── TimeoutError
    │   ├── IntegrityError
    │   │   ├── UniqueConstraintError
    │   │   └── ForeignKeyConstraintError
    │   └── TransactionError
    └── SyncError
        ├── SyncConflictError
        ├── SyncTimeoutError
        └── OfflineError
```

## Core Errors

### ORMError

Base class for all ORM.js errors.

```typescript
class ORMError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'ORMError';
  }
}
```

**Usage:**

```typescript
try {
  // ORM operations
} catch (error) {
  if (error instanceof ORMError) {
    console.log('ORM-specific error:', error.message);
    console.log('Error code:', error.code);
  } else {
    // Other errors
  }
}
```

## Validation Errors

### ValidationError

Raised when data fails validation.

```typescript
class ValidationError extends ORMError {
  constructor(
    message: string,
    public errors: Record<string, string[]> = {}
  ) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}
```

**Example:**

```typescript
try {
  await User.objects.create({
    name: 'A', // Too short
    email: 'invalid', // Invalid email
    age: -5, // Negative age
  });
} catch (error) {
  if (error instanceof ValidationError) {
    console.log(error.errors);
    // {
    //   name: ['Must be at least 3 characters'],
    //   email: ['Invalid email format'],
    //   age: ['Must be greater than 0']
    // }
  }
}
```

**Handling in UI:**

```typescript
async function handleSubmit(data) {
  try {
    await User.objects.create(data);
  } catch (error) {
    if (error instanceof ValidationError) {
      // Show field-specific errors
      Object.entries(error.errors).forEach(([field, errors]) => {
        showFieldError(field, errors[0]);
      });
    }
  }
}
```

### FieldValidationError

Specific field validation failed.

```typescript
class FieldValidationError extends ValidationError {
  constructor(
    public field: string,
    public value: any,
    message: string
  ) {
    super(`${field}: ${message}`, { [field]: [message] });
    this.name = 'FieldValidationError';
  }
}
```

**Example:**

```typescript
// Raised by CharField when maxLength exceeded
throw new FieldValidationError(
  'name',
  'Very long name...',
  'Maximum length is 100 characters'
);
```

### ModelValidationError

Model-level validation failed (from `clean()` method).

```typescript
class ModelValidationError extends ValidationError {
  constructor(message: string, errors: Record<string, string[]>) {
    super(message, errors);
    this.name = 'ModelValidationError';
  }
}
```

**Example:**

```typescript
class User extends Model {
  password = new CharField();
  passwordConfirm = new CharField();

  async clean() {
    if (this.password !== this.passwordConfirm) {
      throw new ModelValidationError('Passwords do not match', {
        passwordConfirm: ['Passwords must match'],
      });
    }
  }
}
```

## Query Errors

### DoesNotExist

Raised when `get()` finds no matching object.

```typescript
class DoesNotExist extends QueryError {
  constructor(
    public modelName: string,
    public filters: any
  ) {
    super(`${modelName} matching query does not exist`, 'DOES_NOT_EXIST');
    this.name = 'DoesNotExist';
  }
}
```

**Example:**

```typescript
try {
  const user = await User.objects.get({ id: 999 });
} catch (error) {
  if (error instanceof DoesNotExist) {
    console.log('User not found');
    console.log('Model:', error.modelName); // 'User'
    console.log('Filters:', error.filters); // { id: 999 }
  }
}
```

**Handling:**

```typescript
// Option 1: Catch the error
try {
  const user = await User.objects.get({ id: userId });
} catch (error) {
  if (error instanceof DoesNotExist) {
    return res.status(404).json({ error: 'User not found' });
  }
  throw error;
}

// Option 2: Use filter().first() to avoid error
const user = await User.objects.filter({ id: userId }).first();
if (!user) {
  return res.status(404).json({ error: 'User not found' });
}
```

### MultipleObjectsReturned

Raised when `get()` finds multiple matching objects.

```typescript
class MultipleObjectsReturned extends QueryError {
  constructor(
    public modelName: string,
    public filters: any,
    public count: number
  ) {
    super(
      `get() returned ${count} ${modelName} objects, expected 1`,
      'MULTIPLE_OBJECTS_RETURNED'
    );
    this.name = 'MultipleObjectsReturned';
  }
}
```

**Example:**

```typescript
try {
  // Multiple users named 'John'
  const user = await User.objects.get({ name: 'John' });
} catch (error) {
  if (error instanceof MultipleObjectsReturned) {
    console.log(`Found ${error.count} users`);
    // Use filter() instead
    const users = await User.objects.filter({ name: 'John' }).all();
  }
}
```

### InvalidQueryError

Raised for invalid query operations.

```typescript
class InvalidQueryError extends QueryError {
  constructor(message: string) {
    super(message, 'INVALID_QUERY');
    this.name = 'InvalidQueryError';
  }
}
```

**Examples:**

```typescript
// Invalid field name
User.objects.filter({ nonExistentField: 'value' });
// Throws: InvalidQueryError: Unknown field 'nonExistentField' on User

// Invalid lookup
User.objects.filter({ age__invalidLookup: 30 });
// Throws: InvalidQueryError: Unknown lookup 'invalidLookup'

// Invalid ordering
User.objects.order_by('nonExistentField');
// Throws: InvalidQueryError: Unknown field 'nonExistentField'
```

## Relationship Errors

### RelatedObjectDoesNotExist

Raised when accessing a related object that doesn't exist.

```typescript
class RelatedObjectDoesNotExist extends RelationshipError {
  constructor(
    public modelName: string,
    public relatedField: string
  ) {
    super(
      `${modelName}.${relatedField} does not exist`,
      'RELATED_OBJECT_DOES_NOT_EXIST'
    );
    this.name = 'RelatedObjectDoesNotExist';
  }
}
```

**Example:**

```typescript
const post = await Post.objects.get({ id: 1 });

try {
  const author = await post.author;
} catch (error) {
  if (error instanceof RelatedObjectDoesNotExist) {
    console.log('Author not found for this post');
  }
}
```

### InvalidRelationshipError

Raised for invalid relationship operations.

```typescript
class InvalidRelationshipError extends RelationshipError {
  constructor(message: string) {
    super(message, 'INVALID_RELATIONSHIP');
    this.name = 'InvalidRelationshipError';
  }
}
```

**Example:**

```typescript
// Trying to set wrong type
post.author = 'not a user'; // String instead of User
// Throws: InvalidRelationshipError: Expected User instance

// Circular relationship
author.posts.add(post);
post.author = author; // OK
post.author = post; // Error: Circular reference
```

## Adapter Errors

### ConnectionError

Raised when adapter cannot connect to backend.

```typescript
class ConnectionError extends AdapterError {
  constructor(
    message: string,
    public adapter: string,
    public details?: any
  ) {
    super(message, 'CONNECTION_ERROR');
    this.name = 'ConnectionError';
  }
}
```

**Example:**

```typescript
const adapter = new PostgresAdapter({
  host: 'invalid-host',
  database: 'mydb',
});

try {
  await adapter.connect();
} catch (error) {
  if (error instanceof ConnectionError) {
    console.log('Failed to connect to database');
    console.log('Adapter:', error.adapter); // 'PostgresAdapter'
    console.log('Details:', error.details);
  }
}
```

### TimeoutError

Raised when operation times out.

```typescript
class TimeoutError extends AdapterError {
  constructor(
    message: string,
    public operation: string,
    public timeoutMs: number
  ) {
    super(message, 'TIMEOUT_ERROR');
    this.name = 'TimeoutError';
  }
}
```

**Example:**

```typescript
try {
  await User.objects.all(); // Very large table
} catch (error) {
  if (error instanceof TimeoutError) {
    console.log(`Operation ${error.operation} timed out after ${error.timeoutMs}ms`);
  }
}
```

### IntegrityError

Base class for constraint violations.

```typescript
class IntegrityError extends AdapterError {
  constructor(
    message: string,
    public constraint?: string
  ) {
    super(message, 'INTEGRITY_ERROR');
    this.name = 'IntegrityError';
  }
}
```

#### UniqueConstraintError

Raised when unique constraint is violated.

```typescript
class UniqueConstraintError extends IntegrityError {
  constructor(
    public field: string,
    public value: any
  ) {
    super(
      `${field} with value "${value}" already exists`,
      'UNIQUE_CONSTRAINT'
    );
    this.name = 'UniqueConstraintError';
  }
}
```

**Example:**

```typescript
await User.objects.create({ email: 'test@example.com' });

try {
  await User.objects.create({ email: 'test@example.com' }); // Duplicate
} catch (error) {
  if (error instanceof UniqueConstraintError) {
    console.log(`Email ${error.value} is already taken`);
  }
}
```

#### ForeignKeyConstraintError

Raised when foreign key constraint is violated.

```typescript
class ForeignKeyConstraintError extends IntegrityError {
  constructor(
    public field: string,
    public value: any
  ) {
    super(
      `Foreign key constraint failed on ${field}`,
      'FOREIGN_KEY_CONSTRAINT'
    );
    this.name = 'ForeignKeyConstraintError';
  }
}
```

**Example:**

```typescript
try {
  await Post.objects.create({
    title: 'My Post',
    author_id: 999, // Non-existent user
  });
} catch (error) {
  if (error instanceof ForeignKeyConstraintError) {
    console.log('Author does not exist');
  }
}
```

### TransactionError

Raised when transaction fails.

```typescript
class TransactionError extends AdapterError {
  constructor(message: string, public cause?: Error) {
    super(message, 'TRANSACTION_ERROR');
    this.name = 'TransactionError';
  }
}
```

**Example:**

```typescript
try {
  await adapter.transaction(async () => {
    await User.objects.create({...});
    throw new Error('Oops'); // Will rollback
  });
} catch (error) {
  if (error instanceof TransactionError) {
    console.log('Transaction failed:', error.cause);
  }
}
```

## Sync Errors

### SyncConflictError

Raised when local and remote versions conflict.

```typescript
class SyncConflictError extends SyncError {
  constructor(
    public model: string,
    public localVersion: any,
    public remoteVersion: any,
    public conflicts: string[]
  ) {
    super(
      `Sync conflict on ${model}`,
      'SYNC_CONFLICT'
    );
    this.name = 'SyncConflictError';
  }
}
```

**Example:**

```typescript
try {
  await syncAdapter.sync();
} catch (error) {
  if (error instanceof SyncConflictError) {
    console.log('Conflicts:', error.conflicts);
    // ['title', 'content']

    // Resolve manually
    const resolved = await showConflictUI(
      error.localVersion,
      error.remoteVersion
    );
  }
}
```

### OfflineError

Raised when operation requires network but device is offline.

```typescript
class OfflineError extends SyncError {
  constructor(public operation: string) {
    super(
      `Cannot ${operation} while offline`,
      'OFFLINE_ERROR'
    );
    this.name = 'OfflineError';
  }
}
```

**Example:**

```typescript
try {
  await syncAdapter.sync();
} catch (error) {
  if (error instanceof OfflineError) {
    console.log('Cannot sync while offline');
    // Queue for later
  }
}
```

## Handling Errors

### Try-Catch Pattern

```typescript
async function getUser(id: number) {
  try {
    return await User.objects.get({ id });
  } catch (error) {
    if (error instanceof DoesNotExist) {
      return null; // Or throw custom error
    }

    if (error instanceof ConnectionError) {
      throw new ServiceUnavailableError('Database unavailable');
    }

    // Unknown error
    throw error;
  }
}
```

### Error Middleware (Express)

```typescript
app.post('/users', async (req, res, next) => {
  try {
    const user = await User.objects.create(req.body);
    res.json(user);
  } catch (error) {
    next(error); // Pass to error handler
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof ValidationError) {
    return res.status(400).json({
      error: 'Validation failed',
      fields: error.errors,
    });
  }

  if (error instanceof DoesNotExist) {
    return res.status(404).json({
      error: 'Resource not found',
    });
  }

  if (error instanceof UniqueConstraintError) {
    return res.status(409).json({
      error: `${error.field} already exists`,
    });
  }

  if (error instanceof ORMError) {
    return res.status(500).json({
      error: 'Database error',
      code: error.code,
    });
  }

  // Other errors
  res.status(500).json({ error: 'Internal server error' });
});
```

### Global Error Handler

```typescript
// Setup global handler
ORM.on('error', (error, context) => {
  console.error('ORM Error:', error);
  console.error('Context:', context);

  // Send to error tracking service
  Sentry.captureException(error, {
    tags: {
      orm_operation: context.operation,
      model: context.model,
    },
  });
});

// Errors will be logged and tracked
await User.objects.create({...}); // If fails, handler is called
```

### Graceful Degradation

```typescript
async function loadData() {
  try {
    return await fetchFromDatabase();
  } catch (error) {
    if (error instanceof ConnectionError) {
      // Fallback to cache
      return await fetchFromCache();
    }

    if (error instanceof TimeoutError) {
      // Return partial data
      return await fetchPartialData();
    }

    throw error;
  }
}
```

## Custom Errors

### Creating Custom Errors

```typescript
// Domain-specific error
class InsufficientBalanceError extends ORMError {
  constructor(
    public userId: number,
    public balance: number,
    public required: number
  ) {
    super(
      `Insufficient balance: have ${balance}, need ${required}`,
      'INSUFFICIENT_BALANCE'
    );
    this.name = 'InsufficientBalanceError';
  }
}

// Usage
class User extends Model {
  balance = new FloatField({ default: 0 });

  async withdraw(amount: number) {
    if (this.balance < amount) {
      throw new InsufficientBalanceError(
        this.id,
        this.balance,
        amount
      );
    }

    this.balance -= amount;
    await this.save();
  }
}
```

### Custom Validation Errors

```typescript
class PasswordTooWeakError extends ValidationError {
  constructor() {
    super('Password too weak', {
      password: [
        'Password must contain uppercase, lowercase, number, and symbol',
      ],
    });
    this.name = 'PasswordTooWeakError';
  }
}

// Validator
function strongPasswordValidator(value: string) {
  const hasUpper = /[A-Z]/.test(value);
  const hasLower = /[a-z]/.test(value);
  const hasNumber = /\d/.test(value);
  const hasSymbol = /[!@#$%^&*]/.test(value);

  if (!(hasUpper && hasLower && hasNumber && hasSymbol)) {
    throw new PasswordTooWeakError();
  }
}
```

## Best Practices

### 1. Always Handle DoesNotExist

```typescript
// Good
try {
  const user = await User.objects.get({ id: userId });
} catch (error) {
  if (error instanceof DoesNotExist) {
    return res.status(404).json({ error: 'User not found' });
  }
  throw error;
}

// Or use filter().first()
const user = await User.objects.filter({ id: userId }).first();
if (!user) {
  return res.status(404).json({ error: 'User not found' });
}
```

### 2. Provide Helpful Error Messages

```typescript
// Good
throw new ValidationError('Invalid email format: must be user@domain.com');

// Bad
throw new Error('Invalid');
```

### 3. Log Errors with Context

```typescript
catch (error) {
  console.error('Failed to create user', {
    error,
    input: req.body,
    userId: req.user?.id,
    timestamp: new Date(),
  });
}
```

### 4. Don't Swallow Errors

```typescript
// Bad
try {
  await User.objects.create(data);
} catch (error) {
  // Silent failure!
}

// Good
try {
  await User.objects.create(data);
} catch (error) {
  console.error(error);
  throw error; // Or handle appropriately
}
```

### 5. Use Specific Error Types

```typescript
// Good
if (error instanceof UniqueConstraintError) {
  return 'Email already taken';
}

// Bad
if (error.message.includes('unique')) {
  // Fragile string matching
}
```

### 6. Document Expected Errors

```typescript
/**
 * Get user by ID
 *
 * @throws {DoesNotExist} If user not found
 * @throws {ConnectionError} If database unavailable
 */
async function getUser(id: number): Promise<User> {
  return await User.objects.get({ id });
}
```

### 7. Test Error Handling

```typescript
it('should handle DoesNotExist', async () => {
  await expect(
    User.objects.get({ id: 999 })
  ).rejects.toThrow(DoesNotExist);
});

it('should handle ValidationError', async () => {
  await expect(
    User.objects.create({ email: 'invalid' })
  ).rejects.toThrow(ValidationError);
});
```
