/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AbstractLevelDOWN, AbstractBatch, PutBatch, DelBatch } from 'abstract-leveldown'
import type LevelDOWN from 'leveldown'
import {
  Database,
  BatchOperation,
  DatabaseSchema,
  DatabaseStore,
  IDatabaseBatch,
  IDatabaseStore,
  IDatabaseStoreOptions,
  IDatabaseTransaction,
  SchemaKey,
  SchemaValue,
  DatabaseOptions,
  StringEncoding,
  JsonEncoding,
  DuplicateKeyError,
  UpgradeFunction,
} from './database'
import { IJsonSerializable } from '../serde'
import levelup, { LevelUp } from 'levelup'
import { AsyncUtils } from '../utils/async'
import { Mutex, MutexUnlockFunction } from './mutex'
import BufferToStringEncoding from './database/encoding'
import MurmurHash3 from 'imurmurhash'
import levelErrors from 'level-errors'
import { DatabaseIsLockedError } from './database/errors'

const ENABLE_TRANSACTIONS = true
const BUFFER_TO_STRING_ENCODING = new BufferToStringEncoding()

interface INotFoundError {
  type: 'NotFoundError'
}

function isNotFoundError(error: unknown): error is INotFoundError {
  return (error as INotFoundError)?.type === 'NotFoundError'
}

class LevelupBatch implements IDatabaseBatch {
  db: LevelupDatabase
  queue: AbstractBatch[] = []

  constructor(db: LevelupDatabase) {
    this.db = db
  }

  putEncoded(key: Buffer, value: Buffer): LevelupBatch {
    this.queue.push({ type: 'put', key: key, value: value } as PutBatch)
    return this
  }

  delEncoded(key: Buffer): LevelupBatch {
    this.queue.push({ type: 'del', key: key } as DelBatch)
    return this
  }

  put<Schema extends DatabaseSchema>(
    store: IDatabaseStore<Schema>,
    key: SchemaKey<Schema>,
    value: SchemaValue<Schema>,
  ): LevelupBatch {
    const [encodedKey, encodedValue] = store.encode(key, value)
    return this.putEncoded(encodedKey, encodedValue)
  }

  del<Schema extends DatabaseSchema>(
    store: IDatabaseStore<Schema>,
    key: SchemaKey<Schema>,
  ): LevelupBatch {
    const [encodedKey] = store.encode(key)
    return this.delEncoded(encodedKey)
  }

  async commit(): Promise<void> {
    if (this.queue.length === 0) return
    await this.db.levelup.batch(this.queue)
    this.queue.length = 0
  }
}

export class LevelupStore<Schema extends DatabaseSchema> extends DatabaseStore<Schema> {
  db: LevelupDatabase

  /* In non relational KV stores, to emulate 'startswith' you often need
  to use greaterThan and lessThan using the prefix + a glyph marker. To
  search for "App" in a table containing "Apple", "Application", and "Boat"
  you would query "gte('App') && lte('App' + 'ff')" Which would return
  'Apple' and 'Application'
  */
  allKeysRange: { gte: Buffer; lt: Buffer }
  prefixBuffer: Buffer

  constructor(db: LevelupDatabase, options: IDatabaseStoreOptions<Schema>) {
    super(options)
    this.db = db

    // Hash the prefix key to ensure identical length and avoid collisions
    const prefixHash = new MurmurHash3(this.name, 1).result()
    this.prefixBuffer = Buffer.alloc(4)
    this.prefixBuffer.writeUInt32BE(prefixHash)

    const gte = Buffer.alloc(4)
    gte.writeUInt32BE(prefixHash)

    const lt = Buffer.alloc(4)
    lt.writeUInt32BE(prefixHash + 1)

    this.allKeysRange = {
      gte: gte,
      lt: lt,
    }
  }

  async has(key: SchemaKey<Schema>, transaction?: IDatabaseTransaction): Promise<boolean> {
    return (await this.get(key, transaction)) !== undefined
  }

  async get(
    key: SchemaKey<Schema>,
    transaction?: IDatabaseTransaction,
  ): Promise<SchemaValue<Schema> | undefined> {
    const [encodedKey] = this.encode(key)

    if (ENABLE_TRANSACTIONS && transaction instanceof LevelupTransaction) {
      return transaction.get(this, key)
    }

    try {
      const data = (await this.db.levelup.get(encodedKey)) as unknown
      if (data === undefined) return undefined
      if (!(data instanceof Buffer)) return undefined
      return this.valueEncoding.deserialize(data)
    } catch (error: unknown) {
      if (isNotFoundError(error)) return undefined
      throw error
    }
  }

  async *getAllIter(
    transaction?: IDatabaseTransaction,
  ): AsyncGenerator<[SchemaKey<Schema>, SchemaValue<Schema>]> {
    const seen = new Set<string>()

    if (ENABLE_TRANSACTIONS && transaction instanceof LevelupTransaction) {
      await transaction.acquireLock()

      for (const [key, value] of transaction.cache.entries()) {
        const keyBuffer = BUFFER_TO_STRING_ENCODING.deserialize(key)

        const isFromStore = keyBuffer
          .slice(0, this.prefixBuffer.byteLength)
          .equals(this.prefixBuffer)

        if (isFromStore) {
          if (value !== undefined)
            yield [this.decodeKey(keyBuffer), value as SchemaValue<Schema>]
          seen.add(key)
        }
      }
    }

    const stream = this.db.levelup.createReadStream(this.allKeysRange)

    for await (const pair of stream) {
      const { key, value } = (pair as unknown) as { key: Buffer; value: Buffer }
      if (!seen.has(BUFFER_TO_STRING_ENCODING.serialize(key))) {
        yield [this.decodeKey(key), this.valueEncoding.deserialize(value)]
      }
    }
  }

  async getAll(
    transaction?: IDatabaseTransaction,
  ): Promise<Array<[SchemaKey<Schema>, SchemaValue<Schema>]>> {
    return AsyncUtils.materialize(this.getAllIter(transaction))
  }

  async *getAllValuesIter(
    transaction?: IDatabaseTransaction,
  ): AsyncGenerator<SchemaValue<Schema>> {
    for await (const [, value] of this.getAllIter(transaction)) {
      yield value
    }
  }

  async getAllValues(transaction?: IDatabaseTransaction): Promise<Array<SchemaValue<Schema>>> {
    return AsyncUtils.materialize(this.getAllValuesIter(transaction))
  }

  async *getAllKeysIter(transaction?: IDatabaseTransaction): AsyncGenerator<SchemaKey<Schema>> {
    for await (const [key] of this.getAllIter(transaction)) {
      yield key
    }
  }

  async getAllKeys(transaction?: IDatabaseTransaction): Promise<Array<SchemaKey<Schema>>> {
    return AsyncUtils.materialize(this.getAllKeysIter(transaction))
  }

  async clear(): Promise<void> {
    await this.db.levelup.clear(this.allKeysRange)
  }

  async put(value: SchemaValue<Schema>, transaction?: IDatabaseTransaction): Promise<void>
  async put(
    key: SchemaKey<Schema>,
    value: SchemaValue<Schema>,
    transaction?: IDatabaseTransaction,
  ): Promise<void>
  async put(a: unknown, b: unknown, c?: unknown): Promise<void> {
    const { key: rawKey, value, transaction } = parsePut<Schema>(a, b, c)
    const key = rawKey === undefined ? this.makeKey(value) : rawKey

    if (ENABLE_TRANSACTIONS && transaction instanceof LevelupTransaction) {
      return transaction.put(this, key, value)
    }

    const [encodedKey, encodedValue] = this.encode(key, value)
    await this.db.levelup.put(encodedKey, encodedValue)
  }

  async add(value: SchemaValue<Schema>, transaction?: IDatabaseTransaction): Promise<void>
  async add(
    key: SchemaKey<Schema>,
    value: SchemaValue<Schema>,
    transaction?: IDatabaseTransaction,
  ): Promise<void>
  async add(a: unknown, b: unknown, c?: unknown): Promise<void> {
    const { key: rawKey, value, transaction } = parsePut<Schema>(a, b, c)
    const key = rawKey === undefined ? this.makeKey(value) : rawKey

    if (ENABLE_TRANSACTIONS && transaction instanceof LevelupTransaction) {
      return transaction.add(this, key, value)
    }

    if (await this.has(key, transaction)) {
      throw new DuplicateKeyError(`Key already exists ${String(key)}`)
    }

    const [encodedKey, encodedValue] = this.encode(key, value)
    await this.db.levelup.put(encodedKey, encodedValue)
  }

  async del(key: SchemaKey<Schema>, transaction?: IDatabaseTransaction): Promise<void> {
    if (ENABLE_TRANSACTIONS && transaction instanceof LevelupTransaction) {
      return transaction.del(this, key)
    }

    const [encodedKey] = this.encode(key)
    await this.db.levelup.del(encodedKey)
  }

  encode(key: SchemaKey<Schema>): [Buffer]
  encode(key: SchemaKey<Schema>, value: SchemaValue<Schema>): [Buffer, Buffer]
  encode(key: SchemaKey<Schema>, value?: SchemaValue<Schema>): [Buffer] | [Buffer, Buffer] {
    const keyBuffer = this.keyEncoding.serialize(key)
    const encodedKey = Buffer.concat([this.prefixBuffer, keyBuffer])

    if (value === undefined) return [encodedKey]
    return [encodedKey, this.valueEncoding.serialize(value)]
  }

  decodeKey(key: Buffer): SchemaKey<Schema> {
    const keyWithoutPrefix = key.slice(this.prefixBuffer.byteLength)
    return this.keyEncoding.deserialize(keyWithoutPrefix)
  }
}

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

  async commit(): Promise<void> {
    try {
      if (!this.aborting) {
        await this.batch.commit()
      }
    } finally {
      this.releaseLock()
      this.cache.clear()
      this.cacheDelete.clear()
      this.committing = false
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

type MetaSchema = {
  key: string
  value: IJsonSerializable
}

type StorageAbstractLevelDown = AbstractLevelDOWN<string | Buffer, string | Buffer>

export class LevelupDatabase extends Database {
  db: StorageAbstractLevelDown
  metaStore: LevelupStore<MetaSchema>
  lock = new Mutex()
  _levelup: LevelUp | null = null

  get levelup(): LevelUp {
    if (!this._levelup) throw new Error('Database is not open. Call IDatabase.open() first')
    return this._levelup
  }

  constructor(db: StorageAbstractLevelDown) {
    super()
    this.db = db

    this.metaStore = this.addStore<MetaSchema>({
      name: 'Meta',
      version: 1,
      keyEncoding: new StringEncoding(),
      valueEncoding: new JsonEncoding(),
    }) as LevelupStore<MetaSchema>
  }

  get isOpen(): boolean {
    return this._levelup?.isOpen() || false
  }

  getVersion(): number {
    return this.getStores().reduce((memo, s) => memo + s.version, 0)
  }

  async open(options: DatabaseOptions = {}): Promise<void> {
    this._levelup = await new Promise<LevelUp>((resolve, reject) => {
      const opened = levelup(this.db, (error?: unknown) => {
        if (error) {
          if (error instanceof levelErrors.OpenError) {
            reject(new DatabaseIsLockedError(error.message))
          } else {
            reject(error)
          }
        } else {
          resolve(opened)
        }
      })
    })

    await this._levelup.open()

    await this.transaction(
      [this.metaStore, ...this.stores.values()],
      'readwrite',
      async (t) => {
        const upgrade = async (
          versionKey: string,
          newVersion: number,
          upgrade: UpgradeFunction | null = null,
        ): Promise<void> => {
          const oldVersion = await this.metaStore.get(versionKey)

          if (oldVersion !== undefined && typeof oldVersion !== 'number') {
            throw new Error(
              `Corrupted meta store version for ${versionKey} is at: ${String(oldVersion)}`,
            )
          }

          if (oldVersion !== undefined && newVersion < oldVersion) {
            throw new Error(
              `Cannot open database: The database version (${oldVersion}) is newer than the provided schema version (${newVersion})`,
            )
          }

          if (oldVersion == null || newVersion > oldVersion) {
            if (upgrade) {
              await upgrade(this, oldVersion || 0, newVersion, t)
            }

            await this.metaStore.put(versionKey, newVersion, t)
          }
        }

        for (const store of this.stores.values()) {
          await upgrade(`version_${store.name}`, store.version, store.upgrade)
        }

        await upgrade('version', this.getVersion(), options.upgrade)
      },
    )
  }

  async close(): Promise<void> {
    await this._levelup?.close()
    this._levelup = null
  }

  transaction<TResult>(
    scopes: IDatabaseStore<DatabaseSchema>[],
    type: 'readwrite' | 'read',
    handler: (transaction: IDatabaseTransaction) => Promise<TResult>,
  ): Promise<TResult>
  transaction(
    scopes: IDatabaseStore<DatabaseSchema>[],
    type: 'readwrite' | 'read',
  ): IDatabaseTransaction
  transaction(
    scopes: IDatabaseStore<DatabaseSchema>[],
    type: 'readwrite' | 'read',
    handler?: (transaction: IDatabaseTransaction) => Promise<unknown>,
  ): IDatabaseTransaction | Promise<unknown> {
    if (handler === undefined) {
      return new LevelupTransaction(this, scopes, type)
    }

    return this.withTransaction(null, scopes, type, handler)
  }

  batch(
    writes: BatchOperation<
      DatabaseSchema,
      SchemaKey<DatabaseSchema>,
      SchemaValue<DatabaseSchema>
    >[],
  ): Promise<void>
  batch(writes?: undefined): LevelupBatch
  batch(
    writes?: BatchOperation<
      DatabaseSchema,
      SchemaKey<DatabaseSchema>,
      SchemaValue<DatabaseSchema>
    >[],
  ): LevelupBatch | Promise<void> {
    const batch = new LevelupBatch(this)

    if (!writes) return batch

    for (const write of writes) {
      const [store, key, value] = write

      if (!(store instanceof LevelupStore)) {
        throw new Error()
      }

      if (value === undefined) {
        batch.del(store, key)
      } else {
        batch.put(store, key, value)
      }
    }

    return batch.commit()
  }

  protected _createStore<Schema extends DatabaseSchema>(
    options: IDatabaseStoreOptions<Schema>,
  ): IDatabaseStore<Schema> {
    return new LevelupStore(this, options)
  }
}

function parsePut<Schema extends DatabaseSchema>(
  keyOrValue: unknown,
  valueOrTransaction: unknown,
  transaction?: unknown,
): {
  key?: SchemaKey<Schema>
  value?: SchemaValue<Schema>
  transaction?: IDatabaseTransaction
} {
  if (transaction instanceof LevelupTransaction)
    return {
      key: keyOrValue as SchemaKey<Schema>,
      value: valueOrTransaction as SchemaValue<Schema>,
      transaction: transaction,
    }

  if (valueOrTransaction instanceof LevelupTransaction)
    return {
      value: keyOrValue as SchemaValue<Schema>,
      transaction: valueOrTransaction,
    }

  if (valueOrTransaction !== undefined)
    return {
      key: keyOrValue as SchemaKey<Schema>,
      value: valueOrTransaction as SchemaValue<Schema>,
    }

  return {
    value: keyOrValue as SchemaValue<Schema>,
  }
}

export async function makeLevelupDatabaseNode(path: string): Promise<LevelupDatabase> {
  await mkDir(path)

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const leveldown = require('leveldown') as typeof LevelDOWN
  return new LevelupDatabase(leveldown(path))

  async function mkDir(path: string): Promise<void> {
    const { promises: fs } = await import('fs')

    try {
      await fs.mkdir(path, { recursive: true })
    } catch (e: unknown) {
      if (!(e instanceof Error) || !e.message.includes('EEXIST')) throw e
    }
  }
}
