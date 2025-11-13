/**
 * Base Field class and field types for Linquery
 */

import { FieldOptions, ValidatorFn, ModelClass } from '../types';
import { FieldValidationError } from './errors';

/**
 * Abstract base class for all fields
 * The type parameter T represents the TypeScript type of the field value
 */
export abstract class Field<T = unknown> {
  required: boolean;
  default?: T | (() => T);
  unique: boolean;
  validators: ValidatorFn<T>[];
  dbColumn?: string;
  helpText?: string;

  // Type marker for TypeScript inference (not used at runtime)
  readonly __type!: T;

  constructor(options: FieldOptions<T> = {}) {
    this.required = options.required ?? true;
    this.default = options.default;
    this.unique = options.unique ?? false;
    this.validators = options.validators ?? [];
    this.dbColumn = options.dbColumn;
    this.helpText = options.helpText;
  }

  /**
   * Get the field type name (for introspection)
   */
  abstract getType(): string;

  /**
   * Validate the field value
   * Throws FieldValidationError if invalid
   */
  async validate(value: T, fieldName: string): Promise<void> {
    // Check required
    if (this.required && (value === null || value === undefined)) {
      throw new FieldValidationError(fieldName, value, 'This field is required');
    }

    // Run custom validators
    for (const validator of this.validators) {
      await validator(value);
    }

    // Run field-specific validation
    await this.validateValue(value, fieldName);
  }

  /**
   * Field-specific validation (override in subclasses)
   */
  protected async validateValue(_value: T, _fieldName: string): Promise<void> {
    // Override in subclasses
  }

  /**
   * Convert value to database format
   */
  toDB(value: T): unknown {
    return value;
  }

  /**
   * Convert value from database format
   */
  fromDB(value: unknown): T {
    return value as T;
  }

  /**
   * Get field metadata for introspection
   */
  getMetadata(): Record<string, unknown> {
    return {
      type: this.getType(),
      required: this.required,
      unique: this.unique,
      default: this.default,
      helpText: this.helpText,
    };
  }

  /**
   * Get the default value
   */
  getDefault(): T | undefined {
    if (this.default === undefined) {
      return undefined;
    }
    return typeof this.default === 'function' ? (this.default as () => T)() : this.default;
  }
}

/**
 * String field options
 */
export interface CharFieldOptions extends FieldOptions<string> {
  maxLength?: number;
  minLength?: number;
}

/**
 * CharField - String field with max/min length
 */
export class CharField extends Field<string> {
  maxLength?: number;
  minLength?: number;

  constructor(options: CharFieldOptions = {}) {
    super(options);
    this.maxLength = options.maxLength;
    this.minLength = options.minLength;
  }

  override getType(): string {
    return 'string';
  }

  protected override async validateValue(value: string, fieldName: string): Promise<void> {
    if (value === null || value === undefined) {
      return; // Already checked in base class
    }

    if (typeof value !== 'string') {
      throw new FieldValidationError(fieldName, value, 'Must be a string');
    }

    if (this.maxLength !== undefined && value.length > this.maxLength) {
      throw new FieldValidationError(fieldName, value, `Maximum length is ${this.maxLength} characters`);
    }

    if (this.minLength !== undefined && value.length < this.minLength) {
      throw new FieldValidationError(fieldName, value, `Minimum length is ${this.minLength} characters`);
    }
  }

  override getMetadata(): Record<string, unknown> {
    return {
      ...super.getMetadata(),
      maxLength: this.maxLength,
      minLength: this.minLength,
    };
  }
}

/**
 * TextField - Long text field
 */
export class TextField extends CharField {
  constructor(options: CharFieldOptions = {}) {
    super(options);
  }

  override getType(): string {
    return 'text';
  }
}

/**
 * Number field options
 */
export interface NumberFieldOptions extends FieldOptions<number> {
  min?: number;
  max?: number;
}

/**
 * IntegerField - Integer number field
 */
export class IntegerField extends Field<number> {
  min?: number;
  max?: number;

  constructor(options: NumberFieldOptions = {}) {
    super(options);
    this.min = options.min;
    this.max = options.max;
  }

  override getType(): string {
    return 'integer';
  }

  protected override async validateValue(value: number, fieldName: string): Promise<void> {
    if (value === null || value === undefined) {
      return;
    }

    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new FieldValidationError(fieldName, value, 'Must be an integer');
    }

    if (this.min !== undefined && value < this.min) {
      throw new FieldValidationError(fieldName, value, `Must be at least ${this.min}`);
    }

    if (this.max !== undefined && value > this.max) {
      throw new FieldValidationError(fieldName, value, `Must be at most ${this.max}`);
    }
  }

  override getMetadata(): Record<string, unknown> {
    return {
      ...super.getMetadata(),
      min: this.min,
      max: this.max,
    };
  }
}

/**
 * Float field options
 */
export interface FloatFieldOptions extends NumberFieldOptions {
  precision?: number;
}

/**
 * FloatField - Floating point number field
 */
export class FloatField extends Field<number> {
  min?: number;
  max?: number;
  precision?: number;

  constructor(options: FloatFieldOptions = {}) {
    super(options);
    this.min = options.min;
    this.max = options.max;
    this.precision = options.precision;
  }

  override getType(): string {
    return 'float';
  }

  protected override async validateValue(value: number, fieldName: string): Promise<void> {
    if (value === null || value === undefined) {
      return;
    }

    if (typeof value !== 'number') {
      throw new FieldValidationError(fieldName, value, 'Must be a number');
    }

    if (this.min !== undefined && value < this.min) {
      throw new FieldValidationError(fieldName, value, `Must be at least ${this.min}`);
    }

    if (this.max !== undefined && value > this.max) {
      throw new FieldValidationError(fieldName, value, `Must be at most ${this.max}`);
    }
  }

  override toDB(value: number): number {
    if (this.precision !== undefined && value !== null && value !== undefined) {
      return Number(value.toFixed(this.precision));
    }
    return value;
  }

  override getMetadata(): Record<string, unknown> {
    return {
      ...super.getMetadata(),
      min: this.min,
      max: this.max,
      precision: this.precision,
    };
  }
}

/**
 * BooleanField - Boolean field
 */
export class BooleanField extends Field<boolean> {
  constructor(options: FieldOptions<boolean> = {}) {
    super(options);
  }

  override getType(): string {
    return 'boolean';
  }

  protected override async validateValue(value: boolean, fieldName: string): Promise<void> {
    if (value === null || value === undefined) {
      return;
    }

    if (typeof value !== 'boolean') {
      throw new FieldValidationError(fieldName, value, 'Must be a boolean');
    }
  }
}

/**
 * DateTime field options
 */
export interface DateTimeFieldOptions extends FieldOptions<Date> {
  autoNow?: boolean; // Update on every save
  autoNowAdd?: boolean; // Set on creation
}

/**
 * DateTimeField - Date and time field
 */
export class DateTimeField extends Field<Date> {
  autoNow: boolean;
  autoNowAdd: boolean;

  constructor(options: DateTimeFieldOptions = {}) {
    super(options);
    this.autoNow = options.autoNow ?? false;
    this.autoNowAdd = options.autoNowAdd ?? false;

    if (this.autoNow || this.autoNowAdd) {
      this.required = false; // Auto fields can't be required
    }
  }

  override getType(): string {
    return 'datetime';
  }

  protected override async validateValue(value: Date, fieldName: string): Promise<void> {
    if (value === null || value === undefined) {
      return;
    }

    if (!(value instanceof Date)) {
      throw new FieldValidationError(fieldName, value, 'Must be a Date object');
    }

    if (isNaN(value.getTime())) {
      throw new FieldValidationError(fieldName, value, 'Invalid date');
    }
  }

  override toDB(value: Date): string | Date {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }

  override fromDB(value: unknown): Date {
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === 'string') {
      return new Date(value);
    }
    return value as Date;
  }

  override getMetadata(): Record<string, unknown> {
    return {
      ...super.getMetadata(),
      autoNow: this.autoNow,
      autoNowAdd: this.autoNowAdd,
    };
  }
}

/**
 * DateField - Date only field (no time)
 */
export class DateField extends DateTimeField {
  constructor(options: DateTimeFieldOptions = {}) {
    super(options);
  }

  override getType(): string {
    return 'date';
  }

  override toDB(value: Date): string {
    if (value instanceof Date) {
      return value.toISOString().split('T')[0]!; // YYYY-MM-DD
    }
    // If not a Date instance, return as-is (already in string format from DB)
    return String(value);
  }
}

/**
 * JSONField - Store JSON objects
 */
export class JSONField extends Field<Record<string, unknown> | unknown[]> {
  constructor(options: FieldOptions<Record<string, unknown> | unknown[]> = {}) {
    super(options);
  }

  override getType(): string {
    return 'json';
  }

  protected override async validateValue(value: Record<string, unknown> | unknown[], fieldName: string): Promise<void> {
    if (value === null || value === undefined) {
      return;
    }

    if (typeof value !== 'object') {
      throw new FieldValidationError(fieldName, value, 'Must be an object or array');
    }
  }

  override toDB(value: Record<string, unknown> | unknown[]): string {
    return JSON.stringify(value);
  }

  override fromDB(value: unknown): Record<string, unknown> | unknown[] {
    if (typeof value === 'string') {
      return JSON.parse(value);
    }
    return value as Record<string, unknown> | unknown[];
  }
}

/**
 * Choice field options
 */
export interface ChoiceFieldOptions<T> extends FieldOptions<T> {
  choices: readonly T[];
}

/**
 * ChoiceField - Field with limited choices
 */
export class ChoiceField<T extends string | number> extends Field<T> {
  choices: readonly T[];

  constructor(options: ChoiceFieldOptions<T>) {
    super(options);
    this.choices = options.choices;
  }

  override getType(): string {
    return 'choice';
  }

  protected override async validateValue(value: T, fieldName: string): Promise<void> {
    if (value === null || value === undefined) {
      return;
    }

    if (!this.choices.includes(value)) {
      throw new FieldValidationError(fieldName, value, `Must be one of: ${this.choices.join(', ')}`);
    }
  }

  override getMetadata(): Record<string, unknown> {
    return {
      ...super.getMetadata(),
      choices: this.choices,
    };
  }
}

// ============================================================================
// Relationship Fields
// ============================================================================

/**
 * Foreign key cascade options
 */
export type OnDeleteAction = 'CASCADE' | 'SET_NULL' | 'PROTECT' | 'DO_NOTHING';

export interface ForeignKeyFieldOptions<T> extends FieldOptions<T> {
  /** Name for reverse relation on related model */
  relatedName?: string;
  /** What to do when related object is deleted */
  onDelete?: OnDeleteAction;
}

/**
 * ForeignKeyField - Many-to-One relationship
 *
 * Note: This field stores a foreign key ID (number), not the related instance.
 * The related instance is accessed via a property descriptor added by Model.init().
 *
 * @example
 * ```typescript
 * class Book extends Model {
 *   declare author: Author;  // The related instance (accessed via property)
 *   declare author_id: number;  // The stored foreign key ID
 * }
 *
 * Book.init({
 *   title: new CharField({ maxLength: 200 }),
 *   author: new ForeignKeyField(Author, { onDelete: 'CASCADE' }),
 * });
 *
 * // Usage:
 * const book = await Book.objects.get({ id: 1 });
 * const author = await book.author;  // Lazy load
 *
 * // Or eager load:
 * const book = await Book.objects.select_related('author').get({ id: 1 });
 * console.log(book.author.name);  // Already loaded
 * ```
 */
export class ForeignKeyField<T> extends Field<number | null> {
  /** The related model class */
  public relatedModel: ModelClass<T>;
  /** Name for reverse relation */
  public relatedName?: string;
  /** Cascade delete behavior */
  public onDelete: OnDeleteAction;

  constructor(relatedModel: ModelClass<T>, options: Omit<ForeignKeyFieldOptions<number | null>, 'choices'> = {}) {
    super({ ...options, required: options.required ?? false });
    this.relatedModel = relatedModel;
    this.relatedName = options.relatedName;
    this.onDelete = options.onDelete ?? 'CASCADE';
  }

  override getType(): string {
    return 'foreignkey';
  }

  /**
   * Convert from database (store ID as number)
   * The actual instance will be loaded lazily via property descriptor
   */
  override fromDB(value: unknown): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    return Number(value);
  }

  /**
   * Convert to database (extract ID from instance or use ID directly)
   */
  override toDB(value: unknown): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    // If it's already a number (ID), return it
    if (typeof value === 'number') {
      return value;
    }

    // If it's an object with id property, extract the ID
    if (typeof value === 'object' && value !== null && 'id' in value) {
      const id = (value as { id?: unknown }).id;
      return id !== undefined && id !== null ? Number(id) : null;
    }

    return null;
  }

  /**
   * Validate foreign key value
   */
  protected override async validateValue(value: number | null, fieldName: string): Promise<void> {
    if (value === null || value === undefined) {
      return;
    }

    // Validate it's a valid ID
    if (typeof value !== 'number' || value <= 0) {
      throw new FieldValidationError(fieldName, value, 'Foreign key must be a positive number');
    }
  }

  override getMetadata(): Record<string, unknown> {
    return {
      ...super.getMetadata(),
      relatedModel: this.relatedModel.name,
      relatedName: this.relatedName,
      onDelete: this.onDelete,
    };
  }
}

/**
 * OneToOneField - One-to-One relationship
 *
 * Similar to ForeignKey but with a unique constraint.
 * The reverse relation returns a single instance instead of a QuerySet.
 *
 * @example
 * ```typescript
 * class UserProfile extends Model {
 *   declare user: User;
 *   declare user_id: number;
 * }
 *
 * UserProfile.init({
 *   user: new OneToOneField(User, { onDelete: 'CASCADE' }),
 * });
 *
 * // Usage:
 * const profile = await UserProfile.objects.get({ id: 1 });
 * const user = await profile.user;  // Lazy load
 *
 * // Reverse relation (single instance):
 * const user = await User.objects.get({ id: 1 });
 * const profile = await user.profile;  // Not a QuerySet!
 * ```
 */
export class OneToOneField<T> extends ForeignKeyField<T> {
  constructor(relatedModel: ModelClass<T>, options: Omit<ForeignKeyFieldOptions<number | null>, 'choices'> = {}) {
    // OneToOne is just a ForeignKey with unique=true
    super(relatedModel, { ...options, unique: true });
  }

  override getType(): string {
    return 'onetoone';
  }
}

/**
 * ManyToManyField - Many-to-Many relationship
 *
 * Note: For now, this is a placeholder. Full M2M implementation requires:
 * - Auto-creating through table
 * - ManyToManyManager with add(), remove(), clear(), set() methods
 * - Handling of through model
 *
 * This will be fully implemented in a future version.
 */
export class ManyToManyField<T> extends Field<unknown> {
  public relatedModel: ModelClass<T>;
  public relatedName?: string;
  public through?: string;

  constructor(relatedModel: ModelClass<T>, options: { relatedName?: string; through?: string } = {}) {
    super({ required: false });
    this.relatedModel = relatedModel;
    this.relatedName = options.relatedName;
    this.through = options.through;
  }

  override getType(): string {
    return 'manytomany';
  }

  override fromDB(value: unknown): unknown {
    return value;
  }

  override toDB(value: unknown): unknown {
    return value;
  }
}
