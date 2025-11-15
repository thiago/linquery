/**
 * Base Model class for Linquery
 */

import { Field, IntegerField, ForeignKeyField, OneToOneField } from './Field';
import { ModelValidationError } from './errors';
import { signals } from './Signal';
import type { FieldDefinition, ModelClass, ModelInstance, ModelOptions, BackendAdapter } from '../types';

/**
 * Model metadata stored on the class
 */
export interface ModelMetadata {
  tableName?: string;
  fields: Map<string, Field>;
  primaryKey: string;
  adapter?: BackendAdapter;
}

/**
 * Symbol to store metadata on model classes
 */
const MODEL_META = Symbol('model_metadata');

/**
 * Base Model class
 * All models should extend this class
 */
export class Model {
  // Primary key field (usually id)
  id?: number | string;

  // Track if this is a new instance (not saved to DB yet)
  private _isNew = true;

  // Track modified fields
  private _modifiedFields = new Set<string>();

  // Store original values for dirty checking (used in markAsSaved, refresh, toJSON)
  // @ts-ignore - Used for dirty tracking, assigned in constructor and methods
  private _originalValues: Record<string, unknown> = {};

  /**
   * Get the model's metadata
   */
  static getMeta(): ModelMetadata {
    // Use Object.prototype.hasOwnProperty to check for own property
    if (!Object.prototype.hasOwnProperty.call(this, MODEL_META)) {
      throw new Error(`Model ${this.name} has not been initialized. Did you forget to call Model.init()?`);
    }
    return (this as unknown as Record<symbol, ModelMetadata>)[MODEL_META]!;
  }

  /**
   * Initialize a model class with its field definitions
   */
  static init<T extends Model>(fields: FieldDefinition<T>, options: ModelOptions = {}): void {
    const meta: ModelMetadata = {
      tableName: options.tableName ?? this.name.toLowerCase(),
      fields: new Map(),
      primaryKey: options.primaryKey ?? 'id',
      adapter: options.adapter,
    };

    // Add primary key field automatically if not provided (Django-style AutoField)
    const pkField = meta.primaryKey;
    if (!fields[pkField]) {
      // Auto-add an IntegerField for the primary key
      meta.fields.set(pkField, new IntegerField({ required: false }) as Field);
    }

    // Add fields to metadata and handle ForeignKey fields
    for (const [fieldName, field] of Object.entries(fields)) {
      if (field instanceof ForeignKeyField) {
        // For ForeignKey, store the ID field
        const idFieldName = `${fieldName}_id`;
        meta.fields.set(idFieldName, field as Field);

        // Create property descriptor for lazy loading
        this.setupForeignKeyProperty(fieldName, field as ForeignKeyField<unknown>);
      } else {
        // Regular field
        meta.fields.set(fieldName, field as Field);
      }
    }

    // Store metadata on the class
    (this as unknown as Record<symbol, ModelMetadata>)[MODEL_META] = meta;
  }

  /**
   * Setup property descriptor for ForeignKey field (lazy loading)
   */
  private static setupForeignKeyProperty(fieldName: string, field: ForeignKeyField<unknown>): void {
    const idFieldName = `${fieldName}_id`;
    const cacheFieldName = `_${fieldName}`;

    // Setup forward relation (book.author)
    Object.defineProperty(this.prototype, fieldName, {
      get(this: Model) {
        const self = this as unknown as Record<string, unknown>;

        // If already cached, return it (could be null or instance)
        if (cacheFieldName in this) {
          return self[cacheFieldName];
        }

        // Get the ID value
        const id = self[idFieldName];

        // If no ID, return null
        if (id === null || id === undefined) {
          self[cacheFieldName] = null;
          return null;
        }

        // Lazy load: return promise that loads the related instance

        const loadPromise = (field.relatedModel as any).objects.get({ id } as Record<string, unknown>);

        // Cache the promise so multiple accesses don't trigger multiple queries
        self[cacheFieldName] = loadPromise;

        // Return the promise
        return loadPromise;
      },

      set(this: Model, value: unknown) {
        const self = this as unknown as Record<string, unknown>;

        if (value === null || value === undefined) {
          // Setting to null
          self[idFieldName] = null;
          self[cacheFieldName] = null;
        } else if (typeof value === 'number') {
          // Setting by ID
          self[idFieldName] = value;
          // Clear cache so it gets reloaded
          delete self[cacheFieldName];
        } else if (typeof value === 'object' && value !== null) {
          // Setting by instance
          const id = (value as Record<string, unknown>).id;
          if (id === undefined || id === null) {
            throw new Error(`Related object must have an id to be assigned to ${fieldName}`);
          }
          self[idFieldName] = id;
          // Cache the instance
          self[cacheFieldName] = value;
        } else {
          throw new Error(`Invalid value for ForeignKey field ${fieldName}`);
        }
      },

      enumerable: true,
      configurable: true,
    });

    // Setup reverse relation (author.books)
    this.setupReverseRelation(fieldName, field);
  }

  /**
   * Setup reverse relation for ForeignKey field
   * E.g., if Book has author ForeignKey, add books property to Author
   */
  private static setupReverseRelation(fieldName: string, field: ForeignKeyField<unknown>): void {
    // Get the related model class

    const relatedModel = field.relatedModel as any;

    // Check if this is a OneToOneField
    const isOneToOne = field instanceof OneToOneField;

    // Determine the name of the reverse relation
    // If relatedName is specified, use it
    // For OneToOne, default is lowercase model name (e.g., 'profile')
    // For ForeignKey, default is <modelName>_set (e.g., 'book_set')
    const reverseRelationName =
      field.relatedName ?? (isOneToOne ? this.name.toLowerCase() : `${this.name.toLowerCase()}_set`);

    // The foreign key field name on this model
    const idFieldName = `${fieldName}_id`;

    // Store reference to this model for closure
    const sourceModel = this;

    if (isOneToOne) {
      // OneToOne reverse relation returns a single instance (or promise)
      const cacheFieldName = `_${reverseRelationName}`;

      Object.defineProperty(relatedModel.prototype, reverseRelationName, {
        get(this: Model) {
          const self = this as unknown as Record<string, unknown>;

          // Check if instance has been saved (has ID)
          if (!self.id) {
            throw new Error(
              `Cannot access reverse relation '${reverseRelationName}' on unsaved ${relatedModel.name} instance`
            );
          }

          // If already cached, return it
          if (cacheFieldName in this) {
            return self[cacheFieldName];
          }

          // Lazy load: return promise that loads the related instance

          const loadPromise = (sourceModel as any).objects.filter({ [idFieldName]: self.id }).first(); // OneToOne returns single instance

          // Cache the promise
          self[cacheFieldName] = loadPromise;

          return loadPromise;
        },

        enumerable: true,
        configurable: true,
      });
    } else {
      // ForeignKey reverse relation returns a QuerySet
      Object.defineProperty(relatedModel.prototype, reverseRelationName, {
        get(this: Model) {
          const self = this as unknown as Record<string, unknown>;

          // Check if instance has been saved (has ID)
          if (!self.id) {
            throw new Error(
              `Cannot access reverse relation '${reverseRelationName}' on unsaved ${relatedModel.name} instance`
            );
          }

          // Return a filtered QuerySet
          // E.g., Book.objects.filter({ author_id: this.id })

          return (sourceModel as any).objects.filter({ [idFieldName]: self.id });
        },

        enumerable: true,
        configurable: true,
      });
    }
  }

  /**
   * Get the table name for this model
   */
  static getTableName(this: ModelClass): string {
    const meta = (this as unknown as typeof Model).getMeta();
    return meta.tableName ?? this.name.toLowerCase();
  }

  /**
   * Get all fields for this model
   */
  static getFields(this: ModelClass): Map<string, Field> {
    const meta = (this as unknown as typeof Model).getMeta();
    return meta.fields;
  }

  /**
   * Get a specific field
   */
  static getField(this: ModelClass, fieldName: string): Field | undefined {
    const meta = (this as unknown as typeof Model).getMeta();
    return meta.fields.get(fieldName);
  }

  /**
   * Get the primary key field name
   */
  static getPrimaryKey(this: ModelClass): string {
    const meta = (this as unknown as typeof Model).getMeta();
    return meta.primaryKey;
  }

  /**
   * Get the adapter for this model
   */
  static getAdapter(this: ModelClass): BackendAdapter | undefined {
    const meta = (this as unknown as typeof Model).getMeta();
    return meta.adapter;
  }

  /**
   * Set the adapter for this model
   */
  static setAdapter(this: ModelClass, adapter: BackendAdapter): void {
    const meta = (this as unknown as typeof Model).getMeta();
    meta.adapter = adapter;
  }

  /**
   * Create a new model instance
   */
  constructor(data: Partial<ModelInstance> = {}) {
    // Emit pre_init signal

    signals.preInit.send(this.constructor, this as any, { data }).catch(() => {
      // Ignore errors in signal handlers during init
    });

    // Set field values
    Object.assign(this, data);

    // Store original values for dirty tracking
    this._originalValues = { ...data };
    this._isNew = !data.id;

    // Emit post_init signal

    signals.postInit.send(this.constructor, this as any, { data }).catch(() => {
      // Ignore errors in signal handlers during init
    });
  }

  /**
   * Check if this instance is new (not saved to DB)
   */
  isNew(): boolean {
    return this._isNew;
  }

  /**
   * Check if a field has been modified
   */
  isFieldModified(fieldName: string): boolean {
    return this._modifiedFields.has(fieldName);
  }

  /**
   * Get all modified fields
   */
  getModifiedFields(): Set<string> {
    return new Set(this._modifiedFields);
  }

  /**
   * Mark instance as saved
   */
  private markAsSaved(): void {
    this._isNew = false;
    this._modifiedFields.clear();
    this._originalValues = this.toJSON();
  }

  /**
   * Validate all fields
   */
  async validate(): Promise<void> {
    const constructor = this.constructor as any;
    const fields = constructor.getFields() as Map<string, Field>;
    const errors: Record<string, string[]> = {};

    for (const [fieldName, field] of fields) {
      try {
        const value = (this as Record<string, unknown>)[fieldName];
        await field.validate(value, fieldName);
      } catch (error) {
        if (error instanceof Error) {
          if (!errors[fieldName]) {
            errors[fieldName] = [];
          }
          errors[fieldName].push(error.message);
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      throw new ModelValidationError('Validation failed', errors);
    }
  }

  /**
   * Save the model instance
   */
  async save(): Promise<void> {
    const constructor = this.constructor as any;
    const adapter = constructor.getAdapter() as BackendAdapter | undefined;

    if (!adapter) {
      throw new Error(`No adapter configured for model ${constructor.name}`);
    }

    // Emit pre_save signal

    await signals.preSave.send(constructor, this as any, {
      isNew: this._isNew,
    });

    // Apply defaults and auto fields BEFORE validation
    const fields = constructor.getFields() as Map<string, Field>;

    // Apply defaults for new instances
    if (this._isNew) {
      for (const [fieldName, field] of fields) {
        const currentValue = (this as Record<string, unknown>)[fieldName];
        if (currentValue === undefined || currentValue === null) {
          const defaultValue = field.getDefault();
          if (defaultValue !== undefined) {
            (this as Record<string, unknown>)[fieldName] = defaultValue;
          }
        }
      }
    }

    // Handle auto fields (autoNow, autoNowAdd)
    for (const [fieldName, field] of fields) {
      // Check if field has autoNow or autoNowAdd
      const fieldAny = field as {
        autoNow?: boolean;
        autoNowAdd?: boolean;
      };

      if (fieldAny.autoNow) {
        (this as Record<string, unknown>)[fieldName] = new Date();
      } else if (fieldAny.autoNowAdd && this._isNew) {
        (this as Record<string, unknown>)[fieldName] = new Date();
      }
    }

    // Validate after applying defaults
    await this.validate();

    // Convert to DB format
    const data = this.toDB();

    const wasNew = this._isNew;

    // Save to adapter
    if (this._isNew) {
      const result = await adapter.create(constructor, data);
      // Update instance with saved data (including generated ID)
      Object.assign(this, result);
    } else {
      const pk = constructor.getPrimaryKey();
      const pkValue = (this as Record<string, unknown>)[pk];
      await adapter.update(constructor, { [pk]: pkValue }, data);
    }

    this.markAsSaved();

    // Emit post_save signal

    await signals.postSave.send(constructor, this as any, {
      created: wasNew,
    });
  }

  /**
   * Delete the model instance
   */
  async delete(): Promise<void> {
    const constructor = this.constructor as any;
    const adapter = constructor.getAdapter() as BackendAdapter | undefined;

    if (!adapter) {
      throw new Error(`No adapter configured for model ${constructor.name}`);
    }

    if (this._isNew) {
      throw new Error('Cannot delete unsaved model instance');
    }

    const pk = constructor.getPrimaryKey() as string;
    const pkValue = (this as Record<string, unknown>)[pk];

    // Emit pre_delete signal

    await signals.preDelete.send(constructor, this as any);

    await adapter.delete(constructor, { [pk]: pkValue });

    // Emit post_delete signal

    await signals.postDelete.send(constructor, this as any);
  }

  /**
   * Reload the instance from the database
   */
  async refresh(): Promise<void> {
    const constructor = this.constructor as any;
    const adapter = constructor.getAdapter() as BackendAdapter | undefined;

    if (!adapter) {
      throw new Error(`No adapter configured for model ${constructor.name}`);
    }

    if (this._isNew) {
      throw new Error('Cannot refresh unsaved model instance');
    }

    const pk = constructor.getPrimaryKey() as string;
    const pkValue = (this as Record<string, unknown>)[pk];

    const [result] = await adapter.find(constructor, { [pk]: pkValue });

    if (!result) {
      throw new Error('Instance no longer exists in database');
    }

    // Update instance with fresh data
    Object.assign(this, result);
    this._originalValues = this.toJSON();
    this._modifiedFields.clear();
  }

  /**
   * Convert instance to plain JavaScript object
   */
  toJSON(): Record<string, unknown> {
    const constructor = this.constructor as any;
    const fields = constructor.getFields() as Map<string, Field>;
    const result: Record<string, unknown> = {};

    for (const [fieldName] of fields) {
      result[fieldName] = (this as Record<string, unknown>)[fieldName];
    }

    return result;
  }

  /**
   * Convert instance to database format
   */
  toDB(): Record<string, unknown> {
    const constructor = this.constructor as any;
    const fields = constructor.getFields() as Map<string, Field>;
    const result: Record<string, unknown> = {};

    for (const [fieldName, field] of fields) {
      const value = (this as Record<string, unknown>)[fieldName];
      if (value !== undefined) {
        result[field.dbColumn ?? fieldName] = field.toDB(value);
      }
    }

    return result;
  }

  /**
   * Create an instance from database data
   */
  static fromDB<T extends Model>(data: Record<string, unknown>): T {
    const fields = (this as any).getFields() as Map<string, Field>;
    const converted: Record<string, unknown> = {};

    for (const [fieldName, field] of fields) {
      const dbColumn = field.dbColumn ?? fieldName;
      if (dbColumn in data) {
        converted[fieldName] = field.fromDB(data[dbColumn]);
      }
    }

    const instance = new this(converted) as T;
    (instance as Model)._isNew = false;
    (instance as Model)._originalValues = converted;

    return instance;
  }

  /**
   * String representation
   */
  toString(): string {
    const constructor = this.constructor as any;
    const pk = constructor.getPrimaryKey() as string;
    const pkValue = (this as Record<string, unknown>)[pk];
    return `${constructor.name}(${pk}=${pkValue})`;
  }
}
