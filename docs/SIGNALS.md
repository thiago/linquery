# Signals

Signals provide a decoupled way to hook into model lifecycle events and extend behavior without modifying model code.

## Table of Contents

- [Overview](#overview)
- [Built-in Signals](#built-in-signals)
- [Connecting to Signals](#connecting-to-signals)
- [Disconnecting](#disconnecting)
- [Custom Signals](#custom-signals)
- [Use Cases](#use-cases)
- [Best Practices](#best-practices)

## Overview

Signals are a pub/sub system inspired by Django signals. When certain actions occur (like saving a model), signals are dispatched to all registered listeners.

```
┌────────────────────┐
│  Model.save()      │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Emit PRE_SAVE      │
└─────────┬──────────┘
          │
    ┌─────┼─────┬─────────┐
    ▼     ▼     ▼         ▼
  ┌───┐ ┌───┐ ┌───┐    ┌───┐
  │L1 │ │L2 │ │L3 │ ...│Ln │
  └───┘ └───┘ └───┘    └───┘
    Listeners execute in order
          │
          ▼
┌────────────────────┐
│ Perform save       │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Emit POST_SAVE     │
└────────────────────┘
```

## Built-in Signals

### Model Lifecycle Signals

#### PRE_INIT

Sent before a model instance is initialized.

```typescript
signal(SignalType.PRE_INIT).connect((sender, args, kwargs) => {
  console.log(`Creating ${sender.name} with:`, args, kwargs);
});
```

**Arguments:**
- `sender`: The model class
- `args`: Positional arguments passed to constructor
- `kwargs`: Keyword arguments passed to constructor

**Use cases:**
- Logging
- Modifying initialization arguments
- Validation before instantiation

#### POST_INIT

Sent after a model instance is initialized.

```typescript
signal(SignalType.POST_INIT).connect((sender, instance) => {
  console.log(`Created ${sender.name} instance:`, instance);
});
```

**Arguments:**
- `sender`: The model class
- `instance`: The newly created instance

**Use cases:**
- Post-initialization setup
- Registering instance in caches
- Auditing

#### PRE_SAVE

Sent before a model instance is saved.

```typescript
signal(SignalType.PRE_SAVE).connect((sender, instance, update) => {
  console.log(`About to save ${sender.name}:`, instance);
  console.log(`Is update: ${update}`);
});
```

**Arguments:**
- `sender`: The model class
- `instance`: The instance being saved
- `update`: Boolean - true if updating existing, false if creating new

**Use cases:**
- Validation
- Modifying data before save
- Preventing saves (throw error)
- Logging

```typescript
// Example: Auto-generate slug
signal(SignalType.PRE_SAVE).connect(
  (sender, instance, update) => {
    if (!instance.slug) {
      instance.slug = slugify(instance.title);
    }
  },
  { sender: Article }
);
```

#### POST_SAVE

Sent after a model instance is saved.

```typescript
signal(SignalType.POST_SAVE).connect((sender, instance, created) => {
  if (created) {
    console.log(`Created new ${sender.name}`);
  } else {
    console.log(`Updated ${sender.name}`);
  }
});
```

**Arguments:**
- `sender`: The model class
- `instance`: The saved instance
- `created`: Boolean - true if newly created, false if updated

**Use cases:**
- Cache invalidation
- Triggering related actions
- Sending notifications
- Analytics

```typescript
// Example: Send welcome email when user created
signal(SignalType.POST_SAVE).connect(
  async (sender, instance, created) => {
    if (created) {
      await sendWelcomeEmail(instance.email);
    }
  },
  { sender: User }
);
```

#### PRE_DELETE

Sent before a model instance is deleted.

```typescript
signal(SignalType.PRE_DELETE).connect((sender, instance) => {
  console.log(`About to delete ${sender.name}:`, instance);
});
```

**Arguments:**
- `sender`: The model class
- `instance`: The instance being deleted

**Use cases:**
- Archiving before deletion
- Cascade delete related objects
- Preventing deletion (throw error)
- Cleanup

```typescript
// Example: Archive before delete
signal(SignalType.PRE_DELETE).connect(
  async (sender, instance) => {
    await Archive.objects.create({
      modelType: sender.name,
      data: instance.toJSON(),
      deletedAt: new Date(),
    });
  },
  { sender: User }
);
```

#### POST_DELETE

Sent after a model instance is deleted.

```typescript
signal(SignalType.POST_DELETE).connect((sender, instance) => {
  console.log(`Deleted ${sender.name}:`, instance);
});
```

**Arguments:**
- `sender`: The model class
- `instance`: The deleted instance (still has data)

**Use cases:**
- Cache invalidation
- Cleanup external resources
- Logging
- Analytics

#### M2M_CHANGED

Sent when a many-to-many relationship changes.

```typescript
signal(SignalType.M2M_CHANGED).connect(
  (sender, instance, action, model, pks) => {
    console.log(`${action} on ${sender.name}.${model.name}`);
    console.log(`PKs affected:`, pks);
  }
);
```

**Arguments:**
- `sender`: The model class
- `instance`: The instance whose M2M changed
- `action`: 'add', 'remove', 'clear', or 'set'
- `model`: The related model class
- `pks`: Array of related object primary keys

**Use cases:**
- Cache invalidation
- Tracking relationship changes
- Syncing with external systems

```typescript
// Example: Update tag count
signal(SignalType.M2M_CHANGED).connect(
  async (sender, instance, action, model, pks) => {
    if (action === 'add' || action === 'remove') {
      for (const pk of pks) {
        const tag = await model.objects.get({ id: pk });
        tag.usageCount = await tag.posts.count();
        await tag.save();
      }
    }
  },
  { sender: Post }
);
```

### Sync Signals

For offline-first and sync operations.

#### PRE_SYNC

Sent before syncing changes to remote.

```typescript
signal(SignalType.PRE_SYNC).connect((sender, operation) => {
  console.log('About to sync:', operation);
});
```

**Arguments:**
- `sender`: The model class
- `operation`: The sync operation object

**Use cases:**
- Modifying data before sync
- Validating before sync
- Logging

#### POST_SYNC

Sent after successful sync.

```typescript
signal(SignalType.POST_SYNC).connect((sender, operation, result) => {
  console.log('Synced successfully:', result);
});
```

**Arguments:**
- `sender`: The model class
- `operation`: The sync operation object
- `result`: Result from remote

**Use cases:**
- Update UI
- Clear sync flags
- Analytics

#### SYNC_CONFLICT

Sent when a sync conflict occurs.

```typescript
signal(SignalType.SYNC_CONFLICT).connect(
  async (sender, operation, conflict) => {
    const { local, remote, field } = conflict;

    // Show UI to user
    const resolved = await showConflictDialog(local, remote);
    return resolved;
  }
);
```

**Arguments:**
- `sender`: The model class
- `operation`: The sync operation
- `conflict`: Conflict details (local, remote, fields)

**Use cases:**
- Conflict resolution UI
- Auto-resolve strategies
- Logging conflicts

## Connecting to Signals

### Basic Connection

```typescript
import { signal, SignalType } from 'orm-js';

signal(SignalType.POST_SAVE).connect((sender, instance, created) => {
  console.log('Something was saved!');
});
```

### Listen to Specific Model Only

```typescript
signal(SignalType.POST_SAVE).connect(
  (sender, instance, created) => {
    console.log('User saved!');
  },
  { sender: User }  // Only for User model
);
```

### Async Handlers

```typescript
signal(SignalType.POST_SAVE).connect(
  async (sender, instance, created) => {
    await sendEmail(instance.email);
    await updateCache(instance);
  },
  { sender: User }
);
```

### Multiple Handlers

Multiple handlers execute in order of registration:

```typescript
// Handler 1
signal(SignalType.PRE_SAVE).connect((sender, instance) => {
  console.log('Handler 1');
});

// Handler 2
signal(SignalType.PRE_SAVE).connect((sender, instance) => {
  console.log('Handler 2');
});

// When saving, output:
// Handler 1
// Handler 2
```

### Conditional Execution

```typescript
signal(SignalType.POST_SAVE).connect((sender, instance, created) => {
  if (created && instance.isPremium) {
    // Only for new premium users
    sendPremiumWelcome(instance);
  }
});
```

## Disconnecting

### Disconnect Specific Handler

```typescript
const myHandler = (sender, instance) => {
  console.log('Saved!');
};

// Connect
signal(SignalType.POST_SAVE).connect(myHandler);

// Disconnect later
signal(SignalType.POST_SAVE).disconnect(myHandler);
```

### Disconnect All Handlers

```typescript
signal(SignalType.POST_SAVE).disconnectAll();
```

### Disconnect by Sender

```typescript
signal(SignalType.POST_SAVE).disconnectAll({ sender: User });
```

## Custom Signals

Create your own signals for custom events:

```typescript
import { Signal } from 'orm-js';

// Define custom signal
const orderPlaced = new Signal<Order>();

// Connect
orderPlaced.connect(async (sender, order) => {
  await sendOrderConfirmation(order);
  await updateInventory(order);
});

// Emit from your code
class Order extends Model {
  async place() {
    // ... order logic
    await orderPlaced.send(Order, this);
  }
}
```

### Namespaced Signals

```typescript
// Create signal namespace
export const appSignals = {
  userLogin: new Signal<User>(),
  userLogout: new Signal<User>(),
  paymentReceived: new Signal<Payment>(),
};

// Use
appSignals.userLogin.connect(async (sender, user) => {
  await recordLogin(user);
});

// Emit
await appSignals.userLogin.send(User, userInstance);
```

## Use Cases

### 1. Auditing

Track all changes to models:

```typescript
class AuditLog extends Model {
  static adapter = new SQLAdapter({...});

  modelType = new CharField();
  modelId = new IntegerField();
  action = new CharField();  // 'create', 'update', 'delete'
  changes = new JSONField();
  timestamp = new DateTimeField({ autoNowAdd: true });
}

// Log all saves
signal(SignalType.POST_SAVE).connect(
  async (sender, instance, created) => {
    await AuditLog.objects.create({
      modelType: sender.name,
      modelId: instance.id,
      action: created ? 'create' : 'update',
      changes: instance.toJSON(),
    });
  }
);

// Log all deletes
signal(SignalType.POST_DELETE).connect(
  async (sender, instance) => {
    await AuditLog.objects.create({
      modelType: sender.name,
      modelId: instance.id,
      action: 'delete',
      changes: instance.toJSON(),
    });
  }
);
```

### 2. Cache Invalidation

```typescript
import { cache } from './cache';

signal(SignalType.POST_SAVE).connect(
  async (sender, instance) => {
    // Invalidate cache for this instance
    await cache.delete(`user:${instance.id}`);

    // Invalidate list cache
    await cache.delete('users:all');
  },
  { sender: User }
);

signal(SignalType.POST_DELETE).connect(
  async (sender, instance) => {
    await cache.delete(`user:${instance.id}`);
    await cache.delete('users:all');
  },
  { sender: User }
);
```

### 3. Denormalization

Keep denormalized data in sync:

```typescript
class Author extends Model {
  name = new CharField();
  bookCount = new IntegerField({ default: 0 });
}

class Book extends Model {
  title = new CharField();
  author = new ForeignKey(Author, { relatedName: 'books' });
}

// Update author's book count when book created
signal(SignalType.POST_SAVE).connect(
  async (sender, instance, created) => {
    if (created) {
      const author = await instance.author;
      author.bookCount = await author.books.count();
      await author.save();
    }
  },
  { sender: Book }
);

// Update count when book deleted
signal(SignalType.POST_DELETE).connect(
  async (sender, instance) => {
    const author = await instance.author;
    author.bookCount = await author.books.count();
    await author.save();
  },
  { sender: Book }
);
```

### 4. Search Index Updates

```typescript
import { searchIndex } from './search';

signal(SignalType.POST_SAVE).connect(
  async (sender, instance) => {
    await searchIndex.index({
      id: instance.id,
      type: 'article',
      title: instance.title,
      content: instance.content,
    });
  },
  { sender: Article }
);

signal(SignalType.POST_DELETE).connect(
  async (sender, instance) => {
    await searchIndex.remove('article', instance.id);
  },
  { sender: Article }
);
```

### 5. Webhooks

```typescript
signal(SignalType.POST_SAVE).connect(
  async (sender, instance, created) => {
    if (created) {
      await fetch('https://webhook.example.com/user-created', {
        method: 'POST',
        body: JSON.stringify(instance.toJSON()),
      });
    }
  },
  { sender: User }
);
```

### 6. Data Validation

```typescript
signal(SignalType.PRE_SAVE).connect(
  (sender, instance) => {
    // Enforce business rule
    if (instance.age < 18 && instance.isPremium) {
      throw new ValidationError('Users under 18 cannot be premium');
    }
  },
  { sender: User }
);
```

### 7. Auto-populate Fields

```typescript
signal(SignalType.PRE_SAVE).connect(
  (sender, instance, update) => {
    // Auto-generate slug from title
    if (!instance.slug) {
      instance.slug = slugify(instance.title);
    }

    // Update modified timestamp
    instance.modifiedAt = new Date();
  },
  { sender: Article }
);
```

## Best Practices

### 1. Keep Handlers Fast

Signals execute synchronously during model operations. Avoid slow operations:

```typescript
// Bad: Blocks the save
signal(SignalType.POST_SAVE).connect(async (sender, instance) => {
  await slowExternalAPICall(instance);  // 5 seconds!
});

// Good: Queue for background processing
signal(SignalType.POST_SAVE).connect(async (sender, instance) => {
  await jobQueue.enqueue('processUser', instance.id);
});
```

### 2. Handle Errors Gracefully

```typescript
signal(SignalType.POST_SAVE).connect(async (sender, instance) => {
  try {
    await sendEmail(instance.email);
  } catch (error) {
    console.error('Failed to send email:', error);
    // Don't throw - let save succeed
  }
});
```

### 3. Be Careful with Cascades

Avoid infinite loops:

```typescript
// Bad: Infinite loop!
signal(SignalType.POST_SAVE).connect(
  async (sender, instance) => {
    instance.counter += 1;
    await instance.save();  // Triggers POST_SAVE again!
  }
);

// Good: Use flag
signal(SignalType.POST_SAVE).connect(
  async (sender, instance) => {
    if (!instance._skipSignal) {
      instance.counter += 1;
      instance._skipSignal = true;
      await instance.save();
      delete instance._skipSignal;
    }
  }
);
```

### 4. Document Signal Dependencies

```typescript
/**
 * User model
 *
 * Signals:
 * - POST_SAVE: Sends welcome email (see signals/user.ts)
 * - POST_SAVE: Updates cache (see signals/cache.ts)
 * - PRE_DELETE: Archives user data (see signals/archive.ts)
 */
class User extends Model {
  // ...
}
```

### 5. Centralize Signal Setup

```typescript
// signals/index.ts
import './user-signals';
import './article-signals';
import './cache-signals';

// app.ts
import './signals';  // Register all signals
```

### 6. Use TypeScript for Type Safety

```typescript
// Define typed signal
const userSaved = new Signal<{
  sender: typeof User;
  instance: User;
  created: boolean;
}>();

// Type-safe handler
userSaved.connect(({ sender, instance, created }) => {
  instance.email;  // Typed as string
  instance.foo;    // Error: Property 'foo' doesn't exist
});
```

### 7. Test Signals

```typescript
import { vi, describe, it, expect } from 'vitest';

describe('User signals', () => {
  it('should send email on user creation', async () => {
    const emailSpy = vi.spyOn(emailService, 'send');

    await User.objects.create({
      name: 'John',
      email: 'john@example.com',
    });

    expect(emailSpy).toHaveBeenCalledWith({
      to: 'john@example.com',
      subject: 'Welcome',
    });
  });
});
```

## Implementation Details

### Signal Class

```typescript
export class Signal<T = any> {
  private handlers: SignalHandler<T>[] = [];

  connect(
    handler: SignalHandler<T>,
    options?: { sender?: ModelClass }
  ): void {
    this.handlers.push({
      fn: handler,
      sender: options?.sender,
    });
  }

  disconnect(handler: SignalHandler<T>): void {
    this.handlers = this.handlers.filter(h => h.fn !== handler);
  }

  disconnectAll(options?: { sender?: ModelClass }): void {
    if (options?.sender) {
      this.handlers = this.handlers.filter(
        h => h.sender !== options.sender
      );
    } else {
      this.handlers = [];
    }
  }

  async send(sender: ModelClass, ...args: any[]): Promise<void> {
    for (const handler of this.handlers) {
      // Skip if handler is for different sender
      if (handler.sender && handler.sender !== sender) {
        continue;
      }

      await handler.fn(sender, ...args);
    }
  }
}
```

### Global Signal Registry

```typescript
// Singleton registry
const signalRegistry = new Map<SignalType, Signal>();

export function signal(type: SignalType): Signal {
  if (!signalRegistry.has(type)) {
    signalRegistry.set(type, new Signal());
  }
  return signalRegistry.get(type)!;
}
```
