/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { LevelupDatabase } from './database'
import type { LevelupStore } from './store'
import { BufferMap, BufferSet } from 'buffer-map'
import { MutexUnlockFunction } from '../../mutex'
import {
  DatabaseSchema,
  DuplicateKeyError,
  IDatabaseTransaction,
  SchemaKey,
  SchemaValue,
  TransactionWrongDatabaseError,
} from '../database'
import { LevelupBatch } from './batch'

export class LevelupTransaction implements IDatabaseTransaction {
  db: LevelupDatabase
  batch: LevelupBatch
  committing = false
  aborting = false
  cache = new BufferMap<unknown>()
  cacheDelete = new BufferSet()
  unlock: MutexUnlockFunction | null = null
  waiting: Promise<void> | null = null
  waitingResolve: (() => void) | null = null
  id = 0

  static id = 0

  constructor(db: LevelupDatabase) {
    this.db = db
    this.id = ++LevelupTransaction.id
    this.batch = new LevelupBatch(db)
  }

  get size(): number {
    return this.batch.queue.length
  }

  async acquireLock(): Promise<void> {
    if (this.unlock) {
      return
    }

    if (!this.waiting) {
      this.waiting = new Promise((resolve) => (this.waitingResolve = resolve))
      this.unlock = await this.db.lock.lock()
      if (this.waitingResolve) {
        this.waitingResolve()
      }
      this.waiting = null
      this.waitingResolve = null
    } else {
      await this.waiting
    }
  }

  releaseLock(): void {
    if (!this.unlock) {
      return
    }
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
    this.assertIsSameDatabase(store)
    this.assertCanRead()

    const [encodedKey] = store.encode(key)

    if (this.cacheDelete.has(encodedKey)) {
      return undefined
    }

    if (this.cache.has(encodedKey)) {
      const cached = this.cache.get(encodedKey)
      return cached as SchemaValue<Schema>
    }

    const value = await store.get(key)
    this.cache.set(encodedKey, value)
    return value
  }

  async put<Schema extends DatabaseSchema>(
    store: LevelupStore<Schema>,
    key: SchemaKey<Schema>,
    value: SchemaValue<Schema>,
  ): Promise<void> {
    await this.acquireLock()
    this.assertIsSameDatabase(store)
    this.assertCanWrite()

    const [encodedKey, encodedValue] = store.encode(key, value)

    this.batch.putEncoded(encodedKey, encodedValue)
    this.cache.set(encodedKey, value)
    this.cacheDelete.delete(encodedKey)
  }

  async add<Schema extends DatabaseSchema>(
    store: LevelupStore<Schema>,
    key: SchemaKey<Schema>,
    value: SchemaValue<Schema>,
  ): Promise<void> {
    await this.acquireLock()
    this.assertIsSameDatabase(store)
    this.assertCanWrite()

    if (await this.has(store, key)) {
      throw new DuplicateKeyError(`Key already exists ${String(key)}`)
    }

    const [encodedKey, encodedValue] = store.encode(key, value)
    this.batch.putEncoded(encodedKey, encodedValue)
    this.cache.set(encodedKey, value)
    this.cacheDelete.delete(encodedKey)
  }

  async del<Schema extends DatabaseSchema>(
    store: LevelupStore<Schema>,
    key: SchemaKey<Schema>,
  ): Promise<void> {
    await this.acquireLock()
    this.assertIsSameDatabase(store)
    this.assertCanWrite()

    const [encodedKey] = store.encode(key)
    this.batch.delEncoded(encodedKey)
    this.cache.set(encodedKey, undefined)
    this.cacheDelete.add(encodedKey)
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

  private assertIsSameDatabase<Schema extends DatabaseSchema>(
    store: LevelupStore<Schema>,
  ): void {
    if (store.db !== this.db) {
      throw new TransactionWrongDatabaseError(store.name)
    }
  }

  private assertCanRead(): void {
    this.assertCanWrite()
  }

  private assertCanWrite(): void {
    if (this.committing) {
      throw new Error(`Transaction is being committed`)
    }
  }
}
