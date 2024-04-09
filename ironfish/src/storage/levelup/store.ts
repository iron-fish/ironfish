/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { LevelupDatabase } from './database'
import { BufferSet } from 'buffer-map'
import FastPriorityQueue from 'fastpriorityqueue'
import MurmurHash3 from 'imurmurhash'
import { Assert } from '../../assert'
import { AsyncUtils } from '../../utils/async'
import {
  DatabaseIteratorOptions,
  DatabaseKeyRange,
  DatabaseSchema,
  DatabaseStore,
  DuplicateKeyError,
  IDatabaseStoreOptions,
  IDatabaseTransaction,
  SchemaKey,
  SchemaValue,
} from '../database'
import { StorageUtils } from '../database/utils'
import { LevelupTransaction } from './transaction'

const ENABLE_TRANSACTIONS = true

export class LevelupStore<Schema extends DatabaseSchema> extends DatabaseStore<Schema> {
  db: LevelupDatabase

  allKeysRange: DatabaseKeyRange
  prefixBuffer: Buffer

  constructor(db: LevelupDatabase, options: IDatabaseStoreOptions<Schema>) {
    super(options)
    this.db = db

    // Hash the prefix key to ensure identical length and avoid collisions
    const prefixHash = new MurmurHash3(this.name, 1).result()

    this.prefixBuffer = Buffer.alloc(4)
    this.prefixBuffer.writeUInt32BE(prefixHash)

    this.allKeysRange = StorageUtils.getPrefixKeyRange(this.prefixBuffer)
  }

  async has(key: SchemaKey<Schema>, transaction?: IDatabaseTransaction): Promise<boolean> {
    const [encodedKey] = this.encode(key)

    if (ENABLE_TRANSACTIONS && transaction instanceof LevelupTransaction) {
      return transaction.has(this, key)
    }

    return (await this.db.get(encodedKey)) !== undefined
  }

  async get(
    key: SchemaKey<Schema>,
    transaction?: IDatabaseTransaction,
  ): Promise<SchemaValue<Schema> | undefined> {
    const [encodedKey] = this.encode(key)

    if (ENABLE_TRANSACTIONS && transaction instanceof LevelupTransaction) {
      return transaction.get(this, key)
    }

    const data = await this.db.get(encodedKey)

    if (data === undefined) {
      return undefined
    }

    return this.valueEncoding.deserialize(data)
  }

  /* Get an [[`AsyncGenerator`]] that yields all of the key/value pairs in the IDatastore */
  private async *_getAllIter(
    transaction?: IDatabaseTransaction,
    keyRange?: DatabaseKeyRange,
    iteratorOptions?: DatabaseIteratorOptions,
  ): AsyncGenerator<[Buffer, SchemaValue<Schema> | Buffer]> {
    if (keyRange) {
      keyRange = StorageUtils.addPrefixToRange(keyRange, this.prefixBuffer)
    } else {
      keyRange = this.allKeysRange
    }

    const seen = new BufferSet()
    const cacheElements = new FastPriorityQueue<{
      key: Buffer
      value: SchemaValue<Schema> | Buffer
    }>(({ key: a }, { key: b }) =>
      iteratorOptions?.reverse ? b.compare(a) < 0 : a.compare(b) < 0,
    )

    if (ENABLE_TRANSACTIONS && transaction) {
      Assert.isInstanceOf(transaction, LevelupTransaction)
      await transaction.acquireLock()

      for (const [key, value] of transaction.cache.entries()) {
        if (!StorageUtils.hasPrefix(key, this.prefixBuffer)) {
          continue
        }

        if (!StorageUtils.isInRange(key, keyRange)) {
          continue
        }

        seen.add(key)

        if (value === undefined) {
          continue
        }

        if (iteratorOptions?.ordered) {
          cacheElements.add({ key, value })
        } else {
          yield [key, value]
        }
      }
    }

    let nextCacheElement = cacheElements.peek()

    for await (const [key, value] of this.db.getAllIter(keyRange, iteratorOptions)) {
      while (
        nextCacheElement &&
        (iteratorOptions?.reverse
          ? key.compare(nextCacheElement.key) <= 0
          : key.compare(nextCacheElement.key) >= 0)
      ) {
        const element = cacheElements.poll()
        Assert.isNotUndefined(element)
        yield [element.key, element.value]
        nextCacheElement = cacheElements.peek()
      }

      if (seen.has(key)) {
        continue
      } else {
        yield [key, value]
      }
    }

    while (!cacheElements.isEmpty()) {
      const element = cacheElements.poll()
      Assert.isNotUndefined(element)
      yield [element.key, element.value]
    }
  }

  async *getAllIter(
    transaction?: IDatabaseTransaction,
    keyRange?: DatabaseKeyRange,
    iteratorOptions?: DatabaseIteratorOptions,
  ): AsyncGenerator<[SchemaKey<Schema>, SchemaValue<Schema>]> {
    for await (const [key, value] of this._getAllIter(transaction, keyRange, iteratorOptions)) {
      yield [this.decodeKey(key), this.resolveValue(value)]
    }
  }

  async getAll(
    transaction?: IDatabaseTransaction,
    keyRange?: DatabaseKeyRange,
    iteratorOptions?: DatabaseIteratorOptions,
  ): Promise<Array<[SchemaKey<Schema>, SchemaValue<Schema>]>> {
    return AsyncUtils.materialize(this.getAllIter(transaction, keyRange, iteratorOptions))
  }

  async *getAllValuesIter(
    transaction?: IDatabaseTransaction,
    keyRange?: DatabaseKeyRange,
    iteratorOptions?: DatabaseIteratorOptions,
  ): AsyncGenerator<SchemaValue<Schema>> {
    for await (const [, value] of this._getAllIter(transaction, keyRange, iteratorOptions)) {
      yield this.resolveValue(value)
    }
  }

  async getAllValues(
    transaction?: IDatabaseTransaction,
    keyRange?: DatabaseKeyRange,
    iteratorOptions?: DatabaseIteratorOptions,
  ): Promise<Array<SchemaValue<Schema>>> {
    return AsyncUtils.materialize(this.getAllValuesIter(transaction, keyRange, iteratorOptions))
  }

  async *getAllKeysIter(
    transaction?: IDatabaseTransaction,
    keyRange?: DatabaseKeyRange,
    iteratorOptions?: DatabaseIteratorOptions,
  ): AsyncGenerator<SchemaKey<Schema>> {
    for await (const [key] of this._getAllIter(transaction, keyRange, iteratorOptions)) {
      yield this.decodeKey(key)
    }
  }

  async getAllKeys(
    transaction?: IDatabaseTransaction,
    keyRange?: DatabaseKeyRange,
    iteratorOptions?: DatabaseIteratorOptions,
  ): Promise<Array<SchemaKey<Schema>>> {
    return AsyncUtils.materialize(this.getAllKeysIter(transaction, keyRange, iteratorOptions))
  }

  async clear(transaction?: IDatabaseTransaction, keyRange?: DatabaseKeyRange): Promise<void> {
    if (transaction) {
      for await (const key of this.getAllKeysIter(transaction, keyRange)) {
        await this.del(key, transaction)
      }
      return
    }

    if (keyRange) {
      keyRange = StorageUtils.addPrefixToRange(keyRange, this.prefixBuffer)
    } else {
      keyRange = this.allKeysRange
    }

    await this.db.levelup.clear(keyRange ?? this.allKeysRange)
  }

  async put(
    key: SchemaKey<Schema>,
    value: SchemaValue<Schema>,
    transaction?: IDatabaseTransaction,
  ): Promise<void>
  async put(a: unknown, b: unknown, c?: unknown): Promise<void> {
    const { key, value, transaction } = parsePut<Schema>(a, b, c)

    if (key === undefined) {
      throw new Error('No key defined')
    }

    if (ENABLE_TRANSACTIONS && transaction instanceof LevelupTransaction) {
      return transaction.put(this, key, value)
    }

    const [encodedKey, encodedValue] = this.encode(key, value)
    await this.db.put(encodedKey, encodedValue)
  }

  async add(
    key: SchemaKey<Schema>,
    value: SchemaValue<Schema>,
    transaction?: IDatabaseTransaction,
  ): Promise<void>
  async add(a: unknown, b: unknown, c?: unknown): Promise<void> {
    const { key, value, transaction } = parsePut<Schema>(a, b, c)
    if (key === undefined) {
      throw new Error('No key defined')
    }

    if (ENABLE_TRANSACTIONS && transaction instanceof LevelupTransaction) {
      return transaction.add(this, key, value)
    }

    if (await this.has(key, transaction)) {
      throw new DuplicateKeyError(`Key already exists ${String(key)}`)
    }

    const [encodedKey, encodedValue] = this.encode(key, value)
    await this.db.put(encodedKey, encodedValue)
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

    if (value === undefined) {
      return [encodedKey]
    }
    return [encodedKey, this.valueEncoding.serialize(value)]
  }

  decodeKey(key: Buffer): SchemaKey<Schema> {
    const keyWithoutPrefix = key.slice(this.prefixBuffer.byteLength)
    return this.keyEncoding.deserialize(keyWithoutPrefix)
  }

  resolveValue(value: SchemaValue<Schema> | Buffer): SchemaValue<Schema> {
    if (value instanceof Buffer) {
      return this.valueEncoding.deserialize(value)
    }
    return value
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
  if (transaction instanceof LevelupTransaction) {
    return {
      key: keyOrValue as SchemaKey<Schema>,
      value: valueOrTransaction as SchemaValue<Schema>,
      transaction: transaction,
    }
  }

  if (valueOrTransaction instanceof LevelupTransaction) {
    return {
      value: keyOrValue as SchemaValue<Schema>,
      transaction: valueOrTransaction,
    }
  }

  if (valueOrTransaction !== undefined) {
    return {
      key: keyOrValue as SchemaKey<Schema>,
      value: valueOrTransaction as SchemaValue<Schema>,
    }
  }

  return {
    value: keyOrValue as SchemaValue<Schema>,
  }
}
