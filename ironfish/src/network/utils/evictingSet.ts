/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// TODO: This belongs in its own package. I'm surprised I couldn't find one

/**
 * Wrapper around a set that guarantees the set does not grow without bounds.
 * When the set reaches a maximum size, every call to `add()` results
 * in the oldest item being removed.
 *
 * NOTE: This relies on behaviour described in the MDN docs that
 * iterating a set in order always yields values in insertion order.
 * If a JS implementation does not follow this documented behaviour,
 * the elemnet that gets removed is undefined.
 */
export default class EvictingSet<T> {
  private items: Set<T>
  private max_size: number

  constructor(max_size: number) {
    this.max_size = max_size
    this.items = new Set()
  }

  /**
   * Add an item to the set. If the size of the set is too large,
   * the oldest item will be removed.
   */
  add(item: T): void {
    if (this.items.size >= this.max_size) {
      const nextVal = this.items.keys().next()
      if (!nextVal.done) {
        const oldest_item = nextVal.value
        this.items.delete(oldest_item)
      }
    }
    this.items.add(item)
  }

  /**
   * Check if the item is in the set
   */
  has(item: T): boolean {
    return this.items.has(item)
  }
}
