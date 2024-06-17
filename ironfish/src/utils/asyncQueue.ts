/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const EMPTY = Symbol('EMPTY')

function assertValidMaxSize(maxSize: number) {
  if (!Number.isInteger(maxSize)) {
    throw new Error('maxSize must be an integer')
  }
  if (maxSize <= 0) {
    throw new Error('maxSize must be greater than 0')
  }
}

function assertNotEmpty<T>(x: T | typeof EMPTY): asserts x is T {
  if (x === EMPTY) {
    throw new Error('Expected item not to be empty')
  }
}

/**
 * A fixed-size, async queue, implemented on top of a circular buffer.
 */
export class AsyncQueue<Item> {
  /**
   * The circular buffer that backs the queue.
   */
  private readonly items: Array<Item | typeof EMPTY>
  /**
   * The position of the first element in `items`. Calling `pop()` returns `items[start]`
   * (if non-empty).
   */
  private start: number = 0
  /**
   * The number of elements currently sitting in the queue. This can never exceed
   * `items.length`.
   */
  private len: number = 0

  private onReadyToPush: Promise<void>
  private onReadyToPop: Promise<void>

  private triggerReadyToPush: (() => void) | null = null
  private triggerReadyToPop: (() => void) | null = null

  constructor(maxSize: number) {
    assertValidMaxSize(maxSize)

    this.items = Array(maxSize).fill(EMPTY) as Array<Item | typeof EMPTY>

    this.onReadyToPush = Promise.resolve()
    this.onReadyToPop = new Promise((resolve) => {
      this.triggerReadyToPop = resolve
    })
  }

  get size(): number {
    return this.len
  }

  get maxSize(): number {
    return this.items.length
  }

  isEmpty(): boolean {
    return this.len === 0
  }

  isFull(): boolean {
    return this.len === this.items.length
  }

  /**
   * Adds a new element to the end of the queue. If the queue is full, waits until at
   * least one element is popped.
   */
  async push(item: Item): Promise<void> {
    while (this.isFull()) {
      await this.onReadyToPush
    }

    // TODO: should we consider allowing only powers of 2 as maxSize, so that we can use a
    // bit shift instead of a modulo operation?
    const index = (this.start + this.len) % this.items.length
    this.items[index] = item
    this.len += 1

    if (this.triggerReadyToPop && !this.isEmpty()) {
      this.triggerReadyToPop()
      this.triggerReadyToPop = null
    }
    if (this.isFull()) {
      this.onReadyToPush = new Promise((resolve) => {
        this.triggerReadyToPush = resolve
      })
    }
  }

  /**
   * Removes one element from the start of the queue. If the queue is empty, waits until
   * at least one element is pushed.
   */
  async pop(): Promise<Item> {
    while (this.isEmpty()) {
      await this.onReadyToPop
    }

    const item = this.items[this.start]
    this.items[this.start] = EMPTY
    this.start = (this.start + 1) % this.items.length
    this.len -= 1

    if (this.triggerReadyToPush && !this.isFull()) {
      this.triggerReadyToPush()
      this.triggerReadyToPush = null
    }
    if (this.isEmpty()) {
      this.onReadyToPop = new Promise((resolve) => {
        this.triggerReadyToPop = resolve
      })
    }

    assertNotEmpty(item)
    return item
  }

  *[Symbol.iterator](): Generator<Item> {
    for (let i = 0; i < this.len; i++) {
      const j = (this.start + i) % this.items.length
      const item = this.items[j]
      if (item === EMPTY) {
        break
      }
      yield item
    }
  }

  clear() {
    this.len = 0
    this.items.fill(EMPTY)

    if (this.triggerReadyToPush) {
      this.triggerReadyToPush()
      this.triggerReadyToPush = null
    }
    this.onReadyToPop = new Promise((resolve) => {
      this.triggerReadyToPop = resolve
    })
  }
}
