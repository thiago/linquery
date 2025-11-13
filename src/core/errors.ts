/**
 * Error hierarchy for Linquery
 * See docs/ERRORS.md for complete documentation
 */

import { ErrorCode, ValidationErrors } from '../types';

/**
 * Base error class for all ORM errors
 */
export class ORMError extends Error {
  constructor(
    message: string,
    public code: ErrorCode | string = 'ORM_ERROR'
  ) {
    super(message);
    this.name = 'ORMError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation errors
 */
export class ValidationError extends ORMError {
  constructor(
    message: string,
    public errors: ValidationErrors = {}
  ) {
    super(message, ErrorCode.VALIDATION_ERROR);
    this.name = 'ValidationError';
  }
}

export class FieldValidationError extends ValidationError {
  constructor(
    public field: string,
    public value: unknown,
    message: string
  ) {
    super(`${field}: ${message}`, { [field]: [message] });
    this.name = 'FieldValidationError';
  }
}

export class ModelValidationError extends ValidationError {
  constructor(message: string, errors: ValidationErrors) {
    super(message, errors);
    this.name = 'ModelValidationError';
  }
}

/**
 * Query errors
 */
export class QueryError extends ORMError {
  constructor(message: string, code: ErrorCode | string) {
    super(message, code);
    this.name = 'QueryError';
  }
}

export class DoesNotExist extends QueryError {
  constructor(
    public modelName: string,
    public filters: Record<string, unknown>
  ) {
    super(`${modelName} matching query does not exist`, ErrorCode.DOES_NOT_EXIST);
    this.name = 'DoesNotExist';
  }
}

export class MultipleObjectsReturned extends QueryError {
  constructor(
    public modelName: string,
    public filters: Record<string, unknown>,
    public count: number
  ) {
    super(`get() returned ${count} ${modelName} objects, expected 1`, ErrorCode.MULTIPLE_OBJECTS_RETURNED);
    this.name = 'MultipleObjectsReturned';
  }
}

export class InvalidQueryError extends QueryError {
  constructor(message: string) {
    super(message, ErrorCode.INVALID_QUERY);
    this.name = 'InvalidQueryError';
  }
}

/**
 * Relationship errors
 */
export class RelationshipError extends ORMError {
  constructor(message: string, code: ErrorCode | string) {
    super(message, code);
    this.name = 'RelationshipError';
  }
}

export class RelatedObjectDoesNotExist extends RelationshipError {
  constructor(
    public modelName: string,
    public relatedField: string
  ) {
    super(`${modelName}.${relatedField} does not exist`, ErrorCode.RELATED_OBJECT_DOES_NOT_EXIST);
    this.name = 'RelatedObjectDoesNotExist';
  }
}

export class InvalidRelationshipError extends RelationshipError {
  constructor(message: string) {
    super(message, ErrorCode.INVALID_RELATIONSHIP);
    this.name = 'InvalidRelationshipError';
  }
}

/**
 * Adapter errors
 */
export class AdapterError extends ORMError {
  constructor(message: string, code: ErrorCode | string) {
    super(message, code);
    this.name = 'AdapterError';
  }
}

export class ConnectionError extends AdapterError {
  constructor(
    message: string,
    public adapter: string,
    public details?: unknown
  ) {
    super(message, ErrorCode.CONNECTION_ERROR);
    this.name = 'ConnectionError';
  }
}

export class TimeoutError extends AdapterError {
  constructor(
    message: string,
    public operation: string,
    public timeoutMs: number
  ) {
    super(message, ErrorCode.TIMEOUT_ERROR);
    this.name = 'TimeoutError';
  }
}

export class IntegrityError extends AdapterError {
  constructor(
    message: string,
    public constraint?: string
  ) {
    super(message, ErrorCode.INTEGRITY_ERROR);
    this.name = 'IntegrityError';
  }
}

export class UniqueConstraintError extends IntegrityError {
  constructor(
    public field: string,
    public value: unknown
  ) {
    super(`${field} with value "${value}" already exists`, ErrorCode.UNIQUE_CONSTRAINT);
    this.name = 'UniqueConstraintError';
  }
}

export class ForeignKeyConstraintError extends IntegrityError {
  constructor(
    public field: string,
    public value: unknown
  ) {
    super(`Foreign key constraint failed on ${field}`, ErrorCode.FOREIGN_KEY_CONSTRAINT);
    this.name = 'ForeignKeyConstraintError';
  }
}

export class TransactionError extends AdapterError {
  constructor(
    message: string,
    public cause?: Error
  ) {
    super(message, ErrorCode.TRANSACTION_ERROR);
    this.name = 'TransactionError';
  }
}

/**
 * Sync errors
 */
export class SyncError extends ORMError {
  constructor(message: string, code: ErrorCode | string) {
    super(message, code);
    this.name = 'SyncError';
  }
}

export class SyncConflictError extends SyncError {
  constructor(
    public model: string,
    public localVersion: unknown,
    public remoteVersion: unknown,
    public conflicts: string[]
  ) {
    super(`Sync conflict on ${model}`, ErrorCode.SYNC_CONFLICT);
    this.name = 'SyncConflictError';
  }
}

export class OfflineError extends SyncError {
  constructor(public operation: string) {
    super(`Cannot ${operation} while offline`, ErrorCode.OFFLINE_ERROR);
    this.name = 'OfflineError';
  }
}
