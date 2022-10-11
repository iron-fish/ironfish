/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export class Queue<T> {
  private _items: T[] = []

  constructor(private capacity: number = Infinity) {}

  /**
   * Adds @param item to the queue as the last element
   */
  enqueue(item: T): void {
    if (this.isFull()) {
      throw Error('Queue has reached max capacity, you cannot add more items')
    }
    this._items.push(item)
  }

  /**
   * Remove the first element in the queue. If the queue is empty, returns `undefined`
   */
  dequeue(): T | undefined {
    return this._items.shift()
  }

  /**
   * return the number of elements in the queue
   */
  size(): number {
    return this._items.length
  }

  /**
   * Returns true if the queue size reaches the capacity
   */
  isFull(): boolean {
    return this.capacity === this.size()
  }

  /**
   * Get the item in the queue by index
   */
  get(index: number): T | undefined {
    if (index < 0 || index >= this._items.length) {
      return undefined
    }
    return this._items[index]
  }
}
