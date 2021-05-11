/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

declare module 'blru' {
  type GetSizeFunction<TKey, TValue> = (value: TValue, key: TKey) => number

  export class LRU<TKey, TValue> {
    constructor(
      capacity: number,
      getSize?: GetSizeFunction<TKey, TValue> | null,
      CustomMap?: typeof Map | unknown | null,
    )

    map: Map<TKey, TValue>
    size: number
    items: number
    head: LRUItem<TKey, TValue> | null
    tail: LRUItem<TKey, TValue> | null
    pending: LRUBatch<TKey, TValue> | null

    capacity: number
    getSize: GetSizeFunction<TKey, TValue> | null | undefined

    reset(): void
    set(key: TKey, value: TValue): void
    get(key: TKey): TValue | null
    has(key: TKey): boolean
    remove(key: TKey): boolean
    keys(): Array<TKey>
    values(): Array<TValue>
    toArray(): Array<TValue>

    batch(): LRUBatch<TKey, TValue>
    start(): void
    clear(): void
    drop(): void
    commit(): void
    push(key: TKey, value: TValue): void
    unpush(key: TKey): void
  }

  class LRUItem<TKey, TValue> {
    constructor(key: TKey, value: TValue)

    key: TKey
    value: TValue
    next: LRUItem<TKey, TValue> | null
    prev: LRUItem<TKey, TValue> | null
  }

  export class LRUBatch<TKey, TValue> {
    constructor(lru: LRU<TKey, TValue>)

    lru: LRU<TKey, TValue>
    ops: Array<LRUOp<TKey, TValue>>

    set(key: TKey, value: TValue): void
    remove(key: TKey): void
    clear(): void
    commit(): void
  }

  export class LRUOp<TKey, TValue> {
    constructor(remove: boolean, key: TKey, value: TValue)

    remove: boolean
    key: TKey
    value: TValue
  }

  export default LRU
}
