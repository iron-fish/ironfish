/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Create an interface so that we can perform multiple random operations on
// two different queue implementations to see if they perform the same
export interface Queue<T> {
  hash: (v: T) => string
  add(item: T): boolean
  remove(hash: string): T | undefined
  poll(): T | undefined
  has(hash: string): boolean
  size(): number
}

// Create a very simple queue implementation that is slow but adds and removes
// elements in a predicatable fashion. Used to test the more complicated queue
// implementation against
export class SimpleQueue<T> implements Queue<T> {
  private _map: { [key: string]: T } = {}
  private _sorted: [string, T][] = []
  hash: (v: T) => string
  private _compare: (v1: T, v2: T) => boolean

  constructor(compare: (v1: T, v2: T) => boolean, hash: (v: T) => string) {
    this.hash = hash
    this._compare = compare
  }

  add(item: T): boolean {
    const hash = this.hash(item)
    if (this._map[hash]) {
      return false
    }

    this._map[hash] = item
    this._sorted.push([hash, item])
    this._reSort()
    return true
  }

  remove(hash: string): T | undefined {
    const val = this._map[hash]
    delete this._map[hash]
    this._sorted.filter(([h, _]) => h !== hash)
    this._reSort()
    return val
  }

  _reSort(): void {
    this._sorted.sort((a, b) => (this._compare(a[1], b[1]) ? 1 : -1))
  }

  poll(): T | undefined {
    const toReturn = this._sorted.pop()
    if (toReturn === undefined) {
      return undefined
    }

    delete this._map[toReturn[0]]
    return toReturn[1]
  }

  has(hash: string): boolean {
    return this._map[hash] !== undefined
  }

  size(): number {
    return this._sorted.length
  }
}

export function heapSort<T>(queue: Queue<T>, items: T[]): T[] {
  for (const item of items) {
    queue.add(item)
  }

  const sorted: T[] = []
  while (queue.size()) {
    const next = queue.poll()
    if (next) {
      sorted.push(next)
    }
  }

  return sorted
}

export type Return<T> =
  | { a: 'POLL'; r: T | undefined }
  | { a: 'ADD'; r: boolean }
  | { a: 'REMOVE'; r: T | undefined }

export type Action<T> = (queue: Queue<T>) => Return<T>[]
