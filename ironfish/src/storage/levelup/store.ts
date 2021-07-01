/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { LevelupDatabase } from './database'
import MurmurHash3 from 'imurmurhash'
import { AsyncUtils } from '../../utils/async'
import {
  DatabaseSchema,
  DatabaseStore,
  DuplicateKeyError,
  IDatabaseStoreOptions,
  IDatabaseTransaction,
  SchemaKey,
  SchemaValue,
} from '../database'
import { BUFFER_TO_STRING_ENCODING } from '../database/encoding'
import { LevelupTransaction } from './transaction'

const ENABLE_TRANSACTIONS = true

interface INotFoundError {
  type: 'NotFoundError'
}

function isNotFoundError(error: unknown): error is INotFoundError {
  return (error as INotFoundError)?.type === 'NotFoundError'
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
      if (data === undefined) {
        return undefined
      }
      if (!(data instanceof Buffer)) {
        return undefined
      }
      return this.valueEncoding.deserialize(data)
    } catch (error: unknown) {
      if (isNotFoundError(error)) {
        return undefined
      }
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
          if (value !== undefined) {
            yield [this.decodeKey(keyBuffer), value as SchemaValue<Schema>]
          }
          seen.add(key)
        }
      }
    }

    const stream = this.db.levelup.createReadStream(this.allKeysRange)

    for await (const pair of stream) {
      const { key, value } = pair as unknown as { key: Buffer; value: Buffer }
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
    await this.db.levelup.put(encodedKey, encodedValue)
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

    if (value === undefined) {
      return [encodedKey]
    }
    return [encodedKey, this.valueEncoding.serialize(value)]
  }

  decodeKey(key: Buffer): SchemaKey<Schema> {
    const keyWithoutPrefix = key.slice(this.prefixBuffer.byteLength)
    return this.keyEncoding.deserialize(keyWithoutPrefix)
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
