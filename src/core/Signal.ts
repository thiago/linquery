/**
 * Signal system for lifecycle hooks
 *
 * Inspired by Django's signal system, allows connecting handlers to
 * lifecycle events on models.
 */

export type SignalHandler<T = unknown> = (
  sender: unknown,
  instance?: T,
  kwargs?: Record<string, unknown>
) => void | Promise<void>;

export interface SignalReceiver<T = unknown> {
  handler: SignalHandler<T>;
  sender?: unknown;
}

/**
 * Signal class - represents a lifecycle event
 */
export class Signal<T = unknown> {
  private receivers: SignalReceiver<T>[] = [];
  public name: string;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Connect a handler to this signal
   */
  connect(handler: SignalHandler<T>, sender?: unknown): void {
    this.receivers.push({ handler, sender });
  }

  /**
   * Disconnect a handler from this signal
   */
  disconnect(handler: SignalHandler<T>, sender?: unknown): void {
    this.receivers = this.receivers.filter((receiver) => receiver.handler !== handler || receiver.sender !== sender);
  }

  /**
   * Send the signal to all connected handlers
   */
  async send(sender: unknown, instance?: T, kwargs?: Record<string, unknown>): Promise<void> {
    const receivers = this.receivers.filter((receiver) => !receiver.sender || receiver.sender === sender);

    // Execute all handlers (in order)
    for (const receiver of receivers) {
      await receiver.handler(sender, instance, kwargs);
    }
  }

  /**
   * Clear all receivers (useful for testing)
   */
  clear(): void {
    this.receivers = [];
  }
}

/**
 * Model lifecycle signals
 */
export const signals = {
  // Instance lifecycle
  preInit: new Signal('pre_init'),
  postInit: new Signal('post_init'),
  preSave: new Signal('pre_save'),
  postSave: new Signal('post_save'),
  preDelete: new Signal('pre_delete'),
  postDelete: new Signal('post_delete'),

  // Many-to-many
  m2mChanged: new Signal('m2m_changed'),

  // Sync signals
  preSync: new Signal('pre_sync'),
  postSync: new Signal('post_sync'),
  syncConflict: new Signal('sync_conflict'),
  connectivityChange: new Signal('connectivity_change'),
};

/**
 * Helper to create custom signals
 */
export function signal<T = unknown>(name: string): Signal<T> {
  return new Signal(name);
}
