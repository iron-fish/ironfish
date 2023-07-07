/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { LevelupDatabase } from './database'
import type { LevelupStore } from './store'
import { MutexUnlockFunction } from '../../mutex'
import { BenchUtils } from '../../utils/bench'
import {
  BufferToStringEncoding,
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
  cache = new Map<string, unknown>()
  cacheDelete = new Set<string>()
  unlock: MutexUnlockFunction | null = null
  waiting: Promise<void> | null = null
  waitingResolve: (() => void) | null = null
  id = 0

  public lockAcquisition: number
  public lockContention: number
  public lockWaitTime: number
  static id = 0

  constructor(db: LevelupDatabase) {
    this.db = db
    this.id = ++LevelupTransaction.id
    this.batch = new LevelupBatch(db)
    this.lockAcquisition = 0
    this.lockContention = 0
    this.lockWaitTime = 0
  }

  get size(): number {
    return this.batch.queue.length
  }

  async acquireLock(): Promise<void> {
    this.lockAcquisition += 1
    const start = BenchUtils.start()

    if (this.unlock) {
      return
    }

    this.lockContention += 1
    if (!this.waiting) {
      this.waiting = new Promise((resolve) => (this.waitingResolve = resolve))
      this.unlock = await this.db.acquireLock()
      if (this.waitingResolve) {
        this.waitingResolve()
      }
      this.waiting = null
      this.waitingResolve = null
    } else {
      await this.waiting
    }

    this.lockWaitTime = BenchUtils.end(start)
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
    const cacheKey = BufferToStringEncoding.serialize(encodedKey)

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
    this.assertIsSameDatabase(store)
    this.assertCanWrite()

    const [encodedKey, encodedValue] = store.encode(key, value)
    const cacheKey = BufferToStringEncoding.serialize(encodedKey)

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
    this.assertIsSameDatabase(store)
    this.assertCanWrite()

    if (await this.has(store, key)) {
      throw new DuplicateKeyError(`Key already exists ${String(key)}`)
    }

    const [encodedKey, encodedValue] = store.encode(key, value)
    const cacheKey = BufferToStringEncoding.serialize(encodedKey)
    this.batch.putEncoded(encodedKey, encodedValue)
    this.cache.set(cacheKey, value)
    this.cacheDelete.delete(cacheKey)
  }

  async del<Schema extends DatabaseSchema>(
    store: LevelupStore<Schema>,
    key: SchemaKey<Schema>,
  ): Promise<void> {
    await this.acquireLock()
    this.assertIsSameDatabase(store)
    this.assertCanWrite()

    const [encodedKey] = store.encode(key)
    const cacheKey = BufferToStringEncoding.serialize(encodedKey)
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

    this.lockAcquisition = 0
    this.lockContention = 0

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
