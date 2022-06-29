/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export class Event<A extends unknown[]> {
  private handlers: Set<(...args: A) => void | Promise<void>> = new Set()

  /**
   * @returns true if the Event has no listeners
   */
  get isEmpty(): boolean {
    return this.handlers.size === 0
  }

  /**
   * @returns the amount of subscriptions on this event
   */
  get subscribers(): number {
    return this.handlers.size
  }

  /**
   * Adds a handler for when the event is emitted
   * Make sure you unsubscribe using [[Event.off]]
   */
  on(handler: (...args: A) => void | Promise<void>): void {
    this.handlers.add(handler)
  }

  /**
   * Removes an event handler by reference
   *
   * @returns true if the handler was removed
   */
  off(handler: (...args: A) => void | Promise<void>): boolean {
    return this.handlers.delete(handler)
  }

  /**
   * Adds an event handler that's removed after the next event is emitted
   */
  once(handler: (...args: A) => void | Promise<void>): void {
    const wrapper = (...args: A): void | Promise<void> => {
      this.off(wrapper)
      return handler(...args)
    }
    this.handlers.add(wrapper)
  }

  /**
   * Emits the event, calling all handlers for this event
   */
  emit(...args: A): void {
    void this.emitAsync(...args)
  }

  /**
   * Emits the event, calling all handlers, and returns a promise that awaits any async handlers
   */
  async emitAsync(...args: A): Promise<void> {
    const promises = []

    for (const handler of Array.from(this.handlers)) {
      if (this.handlers.has(handler)) {
        promises.push(handler.call(undefined, ...args))
      }
    }

    await Promise.all(promises)
  }

  /**
   * Removes all handlers from the event
   */
  clear(): void {
    this.handlers.clear()
  }
}

/**
 * A utility function that accepts an Event and returns a
 * promise that resolves the first time the event emits.
 *
 * @param event The event to wait for
 * @returns a promise that resolves the first time the event emits
 */
export const waitForEmit = <T extends unknown[]>(event: Event<T>): Promise<T> => {
  return new Promise((resolve) => {
    const handler = (...args: T) => {
      resolve(args)
      event.off(handler)
    }
    event.on(handler)
  })
}
