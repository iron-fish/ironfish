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
import { DatabaseIsLockedError } from '../database/errors'
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

  async open(): Promise<void> {
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
  }

  async close(): Promise<void> {
    await this._levelup?.close()
    this._levelup = null
  }

  async upgrade(version: number): Promise<void> {
    Assert.isTrue(this.isOpen, 'Database needs to be open')

    const current = await this.metaStore.get('version')

    if (current === undefined) {
      await this.metaStore.put('version', version)
      return
    }

    if (typeof current !== 'number') {
      throw new Error(`Corrupted database version ${typeof current}: ${String(current)}`)
    }

    if (current !== version) {
      throw new Error(
        `You are running a newer version of ironfish on an older database.\n` +
          `Run "ironfish reset" to reset your database.\n`,
      )
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

  protected _createStore<Schema extends DatabaseSchema>(
    options: IDatabaseStoreOptions<Schema>,
  ): IDatabaseStore<Schema> {
    return new LevelupStore(this, options)
  }
}
