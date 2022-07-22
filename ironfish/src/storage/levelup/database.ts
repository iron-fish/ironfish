/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AbstractLevelDOWN } from 'abstract-leveldown'
import levelErrors from 'level-errors'
import levelup, { LevelUp } from 'levelup'
import { Assert } from '../../assert'
import { Mutex } from '../../mutex'
import { IJsonSerializable } from '../../serde'
import {
  BatchOperation,
  Database,
  DatabaseSchema,
  IDatabaseStore,
  IDatabaseStoreOptions,
  IDatabaseTransaction,
  JsonEncoding,
  SchemaKey,
  SchemaValue,
  StringEncoding,
} from '../database'
import {
  DatabaseIsCorruptError,
  DatabaseIsLockedError,
  DatabaseIsOpenError,
  DatabaseVersionError,
} from '../database/errors'
import { LevelupBatch } from './batch'
import { LevelupStore } from './store'
import { LevelupTransaction } from './transaction'

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
    if (!this._levelup) {
      throw new Error('Database is not open. Call IDatabase.open() first')
    }
    return this._levelup
  }

  constructor(db: StorageAbstractLevelDown) {
    super()
    this.db = db

    this.metaStore = this.addStore<MetaSchema>({
      name: 'Meta',
      keyEncoding: new StringEncoding(),
      valueEncoding: new JsonEncoding(),
    }) as LevelupStore<MetaSchema>
  }

  get isOpen(): boolean {
    return this._levelup?.isOpen() || false
  }

  /**
   * @param options https://github.com/Level/leveldown/blob/51979d11f576c480bc5729a6adea6ac9fed57216/binding.cc#L980k,
   */
  async open(): Promise<void> {
    this._levelup = await new Promise<LevelUp>((resolve, reject) => {
      const opened = levelup(this.db, (error?: unknown) => {
        if (error) {
          if (error instanceof levelErrors.OpenError) {
            // Here we coerce leveldb specific errors into ironfish storage
            // layer errors. We need to do message discrimination because the
            // leveldb JS wrapper does not provide a way to discriminate on the
            // various native errors. See https://github.com/Level/errors for
            // more information.

            if (error.message.indexOf('Corruption') !== -1) {
              reject(new DatabaseIsCorruptError(error.message, error))
            } else if (error.message.indexOf('IO error: lock') !== -1) {
              reject(new DatabaseIsLockedError(error.message, error))
            } else {
              reject(new DatabaseIsOpenError(error.message, error))
            }
          } else {
            reject(error)
          }
        } else {
          resolve(opened)
        }
      })
    })

    await this._levelup.open()
  }

  async close(): Promise<void> {
    await this._levelup?.close()
    this._levelup = null
  }

  async upgrade(version: number): Promise<void> {
    Assert.isTrue(this.isOpen, 'Database needs to be open')

    const current = await this.getVersion()

    if (current !== version) {
      throw new DatabaseVersionError(current, version)
    }
  }

  transaction<TResult>(
    handler: (transaction: IDatabaseTransaction) => Promise<TResult>,
  ): Promise<TResult>
  transaction(): IDatabaseTransaction
  transaction(
    handler?: (transaction: IDatabaseTransaction) => Promise<unknown>,
  ): IDatabaseTransaction | Promise<unknown> {
    if (handler === undefined) {
      return new LevelupTransaction(this)
    }

    return this.withTransaction(null, handler)
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

    if (!writes) {
      return batch
    }

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

  async getVersion(): Promise<number> {
    let current = await this.metaStore.get('version')

    if (current === undefined) {
      current = 0
      await this.metaStore.put('version', current)
    }

    if (typeof current !== 'number') {
      throw new Error(`Corrupted database version ${typeof current}: ${String(current)}`)
    }

    return current
  }

  async putVersion(version: number, transaction?: IDatabaseTransaction): Promise<void> {
    await this.metaStore.put('version', version, transaction)
  }

  protected _createStore<Schema extends DatabaseSchema>(
    options: IDatabaseStoreOptions<Schema>,
  ): IDatabaseStore<Schema> {
    return new LevelupStore(this, options)
  }
}
