// signal-registry.ts
import type { BaseModel } from "./base-model"
import type { ModelClass } from "../types"

/**
 * Represents the set of default model events that can occur during the lifecycle
 * of an operation on a model or entity. These events typically indicate stages
 * of save or delete operations, providing hooks to execute custom logic.
 *
 * Possible Values:
 * - "pre_save": Triggered before saving the model.
 * - "post_save": Triggered after saving the model.
 * - "pre_delete": Triggered before deleting the model.
 * - "post_delete": Triggered after deleting the model.
 */
export type DefaultModelEvent =
  | "pre_save"
  | "post_save"
  | "pre_delete"
  | "post_delete"

/**
 * Represents a type alias for `ModelEvent` which can be either a `DefaultModelEvent`
 * or a string type combined with an empty object constraint.
 *
 * Can be utilized in contexts where a specific model-related event needs to be
 * represented as one of the defined types.
 */
export type ModelEvent = DefaultModelEvent | (string & {})

/**
 * Represents a callback function type designed to handle signal processing
 * for instances of a specific model extending the `BaseModel` class.
 *
 * This type is used to execute operations such as data updates, validations, or any
 * custom processing on a given instance. The function can handle both synchronous
 * and asynchronous operations.
 *
 * @template T - A model class extending the `BaseModel` type.
 * @param {T} instance - The specific instance of the `BaseModel` to process or handle.
 * @returns {void | Promise<void>} The function can either return nothing for synchronous
 * handling or a `Promise` for asynchronous processing.
 */
export type SignalHandler<T extends BaseModel> = (instance: T) => void | Promise<void>

/**
 * A registry for managing signal handlers related to models and events.
 * Allows registering, removing, and emitting signals for specific model and event combinations.
 */
export class SignalRegistry {
  private handlers: Record<string, SignalHandler<any>[]> = {}

  /**
   * Registers an event handler for a specific event and model type.
   *
   * @param {ModelEvent} event - The event to listen for.
   * @param {ModelClass<T>} model - The model class associated with the event.
   * @param {SignalHandler<T>} handler - The callback function to handle the event.
   * @return {void}
   */
  on<T extends BaseModel>(
    event: ModelEvent,
    model: ModelClass<T>,
    handler: SignalHandler<T>
  ) {
    const key = this._key(event, model)
    if (!this.handlers[key]) this.handlers[key] = []
    this.handlers[key].push(handler)
  }

  /**
   * Removes an event handler or all handlers for a specific event and model combination.
   *
   * @param {ModelEvent} event - The event type to remove handlers for.
   * @param {ModelClass<T>} model - The model associated with the event.
   * @param {SignalHandler<T>} [handler] - The specific handler to remove. If not provided, all handlers for the event and model will be removed.
   * @return {void} - No return value.
   */
  off<T extends BaseModel>(
    event: ModelEvent,
    model: ModelClass<T>,
    handler?: SignalHandler<T>
  ) {
    const key = this._key(event, model)
    if (!this.handlers[key]) return
    if (handler) {
      this.handlers[key] = this.handlers[key].filter(h => h !== handler)
    } else {
      delete this.handlers[key]
    }
  }

  /**
   * Emits an event for a specific model instance and invokes all associated handlers.
   *
   * @param {ModelEvent} event - The event to emit, representing a specific action or occurrence.
   * @param {ModelClass<T>} model - The class of the model for which the event is emitted.
   * @param {T} instance - The instance of the model related to the emitted event.
   * @return {Promise<void>} A promise that resolves when all event handlers have been executed.
   */
  async emit<T extends BaseModel>(
    event: ModelEvent,
    model: ModelClass<T>,
    instance: T
  ): Promise<void> {
    const key = this._key(event, model)
    const handlers = this.handlers[key] || []
    await Promise.all(handlers.map(h => h(instance)))
  }

  private _key(event: string, model: ModelClass<any>): string {
    return `${event}:${model.name}`
  }
}

/**
 * Represents a central registry for managing and storing signals.
 * The `signalsRegistry` variable is an instance of the `SignalRegistry` class,
 * which facilitates the registration, lookup, and management of signal instances
 * used throughout the application.
 */
export const signalsRegistry = new SignalRegistry()


/**
 * Wraps a signal handler function in error handling logic to suppress and optionally log errors.
 *
 * @param {SignalHandler<T>} fn - The signal handler function to be wrapped.
 * @param {boolean} [log] - Optional flag indicating whether to log suppressed errors.
 * @return {SignalHandler<T>} A new signal handler function with error handling.
 */
export function safeHandler<T extends BaseModel>(fn: SignalHandler<T>, log?:boolean): SignalHandler<T> {
  return async (instance: T) => {
    try {
      await fn(instance)
    } catch (err) {
      if(log) console.warn(`[signal] handler suppressed:`, err)
    }
  }
}