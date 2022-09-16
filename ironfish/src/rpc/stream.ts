/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PromiseReject, PromiseResolve } from '../utils'

/*
 * A Stream takes a stream of data and transforms it into an iterable
 * On one end the writer of the data is calling stream.write(data)
 * and on the other end the consumer of the data is calling stream.next()
 *
 * If stream.next() is called before data is written then the request will be queued
 * up in the `waiting` list by saving functions to resolve and reject the request
 *
 * stream.next()      -> [(res, rej)]               a resolve and reject for the data is queued in `waiting`
 * stream.next()      -> [(res, rej), (res, rej)]
 * stream.write(data) -> [(res, rej)]               the first Promise in waiting is resolved with the data
 * stream.write(data) -> []                         the final Promise in waiting is resolved with the data
 *
 * If stream.write() is called before the reader requests with stream.next() then the
 * data will be queued up in the `buffer` list
 *
 * stream.write(1) -> [1]                            data is queued up in the buffer
 * stream.write(2) -> [1, 2]
 * stream.write(3) -> [1, 2, 3]
 * stream.next()   -> [2, 3]                         data is consumed from the buffer and resolved to next()
 * stream.next()   -> [3]
 *
 * Because Stream implements AsyncIterable it can also be used in for...in loops
 */
export class Stream<T> implements AsyncIterable<T> {
  buffer: T[] = []
  waiting: [PromiseResolve<IteratorResult<T>>, PromiseReject][] = []

  closed = false
  error: unknown

  write(value: T): void {
    if (this.closed) {
      return
    }

    const waiting = this.waiting.shift()
    if (waiting) {
      const [resolve] = waiting
      resolve({ done: false, value: value })
      return
    }

    this.buffer.push(value)
  }

  close(e?: unknown): void {
    this.closed = true
    this.error = e

    for (const [resolve, reject] of this.waiting) {
      if (!e) {
        resolve({ value: null, done: true })
      } else {
        reject(e)
      }
    }
  }

  next(): Promise<IteratorResult<T>> {
    if (this.buffer.length > 0) {
      const value = this.buffer.shift()
      return Promise.resolve({ done: false, value: value as T })
    }

    if (this.error) {
      return Promise.reject(this.error)
    }

    if (this.closed) {
      return Promise.resolve({ value: null, done: true })
    }

    return new Promise<IteratorResult<T>>((resolve, reject) => {
      this.waiting.push([resolve, reject])
    })
  }

  [Symbol.asyncIterator](): AsyncIterator<T, void> {
    return { next: () => this.next() }
  }
}
