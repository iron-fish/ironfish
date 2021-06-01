/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  DatabaseSchema,
  DatabaseStore,
  IDatabaseStore,
  IDatabaseTransaction,
  SchemaKey,
  SchemaValue,
  DuplicateKeyError,
  BUFFER_TO_STRING_ENCODING,
} from '../database'
import { MutexUnlockFunction } from '../../mutex'
import type { LevelupStore } from './store'
import type { LevelupDatabase } from './database'
import { LevelupBatch } from './batch'

export class LevelupTransaction implements IDatabaseTransaction {
  db: LevelupDatabase
  scopes: Set<string>
  type: 'readwrite' | 'read'
  batch: LevelupBatch
  committing = false
  aborting = false
  cache = new Map<string, unknown>()
  cacheDelete = new Set<string>()
  unlock: MutexUnlockFunction | null = null
  waiting: Promise<void> | null = null
  waitingResolve: (() => void) | null = null
  id = 0

  static id = 0

  constructor(
    db: LevelupDatabase,
    scopes: IDatabaseStore<DatabaseSchema>[],
    type: 'readwrite' | 'read',
  ) {
    this.db = db
    this.type = type
    this.id = ++LevelupTransaction.id

    this.scopes = new Set(scopes.map((s) => s.name))
    this.batch = new LevelupBatch(db)
  }

  get size(): number {
    return this.batch.queue.length
  }

  async acquireLock(): Promise<void> {
    if (this.unlock) return

    if (!this.waiting) {
      this.waiting = new Promise((resolve) => (this.waitingResolve = resolve))
      this.unlock = await this.db.lock.lock()
      if (this.waitingResolve) this.waitingResolve()
      this.waiting = null
      this.waitingResolve = null
    } else {
      await this.waiting
    }
  }

  releaseLock(): void {
    if (!this.unlock) return
    this.unlock()
  }

  async has<Schema extends DatabaseSchema>(
    store: LevelupStore<Schema>,
    key: SchemaKey<Schema>,
  ): Promise<boolean> {
    await this.acquireLock()
    return (await this.get(store, key)) !== undefined
  }

  async get<Schema extends DatabaseSchema>(
    store: LevelupStore<Schema>,
    key: SchemaKey<Schema>,
  ): Promise<SchemaValue<Schema> | undefined> {
    await this.acquireLock()
    this.assertCanRead(store)

    const [encodedKey] = store.encode(key)
    const cacheKey = BUFFER_TO_STRING_ENCODING.serialize(encodedKey)

    if (this.cacheDelete.has(cacheKey)) {
      return undefined
    }

    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)
      return cached as SchemaValue<Schema>
    }

    const value = await store.get(key)
    this.cache.set(cacheKey, value)
    return value
  }

  async put<Schema extends DatabaseSchema>(
    store: LevelupStore<Schema>,
    key: SchemaKey<Schema>,
    value: SchemaValue<Schema>,
  ): Promise<void> {
    await this.acquireLock()
    this.assertCanWrite(store)

    const [encodedKey, encodedValue] = store.encode(key, value)
    const cacheKey = BUFFER_TO_STRING_ENCODING.serialize(encodedKey)

    this.batch.putEncoded(encodedKey, encodedValue)
    this.cache.set(cacheKey, value)
    this.cacheDelete.delete(cacheKey)
  }

  async add<Schema extends DatabaseSchema>(
    store: LevelupStore<Schema>,
    key: SchemaKey<Schema>,
    value: SchemaValue<Schema>,
  ): Promise<void> {
    await this.acquireLock()
    this.assertCanWrite(store)

    if (await this.has(store, key)) {
      throw new DuplicateKeyError(`Key already exists ${String(key)}`)
    }

    const [encodedKey, encodedValue] = store.encode(key, value)
    const cacheKey = BUFFER_TO_STRING_ENCODING.serialize(encodedKey)
    this.batch.putEncoded(encodedKey, encodedValue)
    this.cache.set(cacheKey, value)
    this.cacheDelete.delete(cacheKey)
  }

  async del<Schema extends DatabaseSchema>(
    store: LevelupStore<Schema>,
    key: SchemaKey<Schema>,
  ): Promise<void> {
    await this.acquireLock()
    this.assertCanWrite(store)

    const [encodedKey] = store.encode(key)
    const cacheKey = BUFFER_TO_STRING_ENCODING.serialize(encodedKey)
    this.batch.delEncoded(encodedKey)
    this.cache.set(cacheKey, undefined)
    this.cacheDelete.add(cacheKey)
  }

  async update(): Promise<void> {
    try {
      if (!this.aborting) {
        await this.batch.commit()
      }
    } finally {
      this.cache.clear()
      this.cacheDelete.clear()
      this.committing = false
    }
  }

  async commit(): Promise<void> {
    try {
      await this.update()
    } finally {
      this.releaseLock()
    }
  }

  async abort(): Promise<void> {
    this.aborting = true
    this.releaseLock()
    return Promise.resolve()
  }

  private assertCanRead(store: DatabaseStore<DatabaseSchema>): void {
    this.assertCanWrite(store)
  }

  private assertCanWrite(store: DatabaseStore<DatabaseSchema>): void {
    if (this.committing) {
      throw new Error(`Transaction is being committed`)
    }

    if (!this.scopes.has(store.name)) {
      throw new Error(
        `Store ${store.name} is not in transaction scopes: ${Array.from(
          this.scopes.values(),
        ).join(', ')}`,
      )
    }
  }
}
