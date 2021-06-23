/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PromiseResolve } from '../utils'

export class Stream<T> implements AsyncIterable<T> {
  buffer: T[] = []
  waiting: PromiseResolve<IteratorResult<T>>[] = []
  closed = false

  write(value: T): void {
    if (this.closed) {
      return
    }

    if (this.waiting.length) {
      const waiting = this.waiting.shift() as PromiseResolve<IteratorResult<T>>
      waiting({ done: false, value: value })
      return
    }

    this.buffer.push(value)
  }

  close(): void {
    this.closed = true

    for (const resolve of this.waiting) {
      resolve({ value: null, done: true })
    }
  }

  next(): Promise<IteratorResult<T>> {
    if (this.buffer.length > 0) {
      const value = this.buffer.shift()
      return Promise.resolve({ done: false, value: value as T })
    }

    if (this.closed) {
      return Promise.resolve({ value: null, done: true })
    }

    return new Promise<IteratorResult<T>>((resolve) => {
      this.waiting.push(resolve)
    })
  }

  [Symbol.asyncIterator](): AsyncIterator<T, void> {
    return { next: () => this.next() }
  }
}
