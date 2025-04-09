export class BaseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }
}

export class DoesNotExist extends BaseError {
  constructor(modelName: string, filters?: Record<string, any>) {
    super(`${modelName} matching filters not found.`)
  }
}

export class MultipleObjectsReturned extends BaseError {
  filters?: Record<string, any>
  constructor(modelName: string, filters?: Record<string, any>) {
    super(`Multiple ${modelName} objects returned for given filters. ${filters ? ` Filters: ${JSON.stringify(filters)}` : ""}`)
    this.filters = filters
  }
}

export class ValidationError extends BaseError {
  public details?: Record<string, string[]>

  constructor(message: string = "Validation error", details?: Record<string, string[]>) {
    super(message)
    this.details = details
  }
}

export class NotImplemented extends BaseError {
  constructor(feature: string) {
    super(`"${feature}" is not implemented.`)
  }
}

export class InvalidRelationFieldError extends BaseError {
  modelName: string
  fieldName: string
  constructor(modelName: string, fieldName: string) {
    super(`Field '${fieldName}' in model '${modelName}' is not a valid relation.`)
    this.modelName = modelName
    this.fieldName = fieldName
  }
}


export class RelatedModelNotFoundError extends BaseError {
  modelName: string
  fieldName: string
  targetModel?: string

  constructor(modelName: string, fieldName: string, targetModel?: string) {
    super(
      `Model '${modelName}' has a relation field '${fieldName}' referencing unknown model '${targetModel}'`
    )
    this.modelName = modelName
    this.fieldName = fieldName
    this.targetModel = targetModel
  }
}


export class ModelAlreadyRegistered extends BaseError {
  constructor(modelName: string) {
    super(`Model '${modelName}' is already registered.`)
  }
}

export class InvalidModelReferenceError extends BaseError {
  constructor({
    modelName,
    fieldName,
    received,
  }: {
    modelName: string
    fieldName: string
    received: unknown
  }) {
    const type = typeof received === "function"
      ? received?.name || "[anonymous function]"
      : JSON.stringify(received)

    super(
      `[linquery] Invalid model reference in field '${fieldName}' of '${modelName}':\n` +
      `Expected a registered model name or a ModelClass, but received: ${type}`
    )
  }
}