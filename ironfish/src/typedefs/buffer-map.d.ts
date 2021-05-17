/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

declare module 'buffer-map' {
  export class BufferMap<T> implements Map<Buffer, T>, Iterable<[Buffer, T]> {
    constructor(iterable: Iterable<T> | null | undefined = null)

    readonly size: number

    get(key: Buffer): T | undefined
    has(key: Buffer): boolean
    set(key: Buffer, value: T): this
    delete(key: Buffer): boolean
    clear(): void

    [Symbol.iterator](): Iterator<[Buffer, T]>

    *entries(): Generator<[Buffer, T]>
    *keys(): Generator<Buffer>
    *values(): Generator<T>

    toKeys(): Buffer[]
    toValues(): T[]
    toArray(): T[]
  }

  export class BufferSet<T> implements Iterable<Buffer> {
    constructor(iterable: Iterable<T> | null | undefined = null)

    readonly size: number

    has(key: Buffer): boolean
    add(key: Buffer): this
    delete(key: Buffer): boolean
    clear(): void

    [Symbol.iterator](): Iterator<[Buffer, T]>

    *entries(): Generator<[Buffer, Bufferd]>
    keys(): Iterator<Buffer>
    values(): Iterator<Buffer>

    forEach(
      func: (value: Buffer, key: Buffer, set: BufferSet<T>) => void,
      self: BuffSet<T>,
    ): void

    toKeys(): Buffer[]
    toValues(): Buffer[]
    toArray(): Buffer[]
  }
}
