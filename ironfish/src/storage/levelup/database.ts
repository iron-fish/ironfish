/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AbstractLevelDOWN } from 'abstract-leveldown'
import levelErrors from 'level-errors'
import levelup, { LevelUp } from 'levelup'
import { Mutex } from '../../mutex'
import { IJsonSerializable } from '../../serde'
import {
  BatchOperation,
  Database,
  DatabaseOptions,
  DatabaseSchema,
  IDatabaseStore,
  IDatabaseStoreOptions,
  IDatabaseTransaction,
  JsonEncoding,
  SchemaKey,
  SchemaValue,
  StringEncoding,
  UpgradeFunction,
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

          if (!oldVersion || newVersion > oldVersion) {
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
