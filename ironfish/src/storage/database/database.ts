/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  BatchOperation,
  DatabaseOptions,
  DatabaseSchema,
  IDatabase,
  IDatabaseBatch,
  IDatabaseStore,
  IDatabaseStoreOptions,
  IDatabaseTransaction,
  SchemaKey,
  SchemaValue,
} from './types'
import { DatabaseIsOpenError } from './errors'

export abstract class Database implements IDatabase {
  stores = new Map<string, IDatabaseStore<DatabaseSchema>>()

  abstract get isOpen(): boolean

  abstract open(options?: DatabaseOptions): Promise<void>
  abstract close(): Promise<void>

  abstract transaction(
    scopes: IDatabaseStore<DatabaseSchema>[],
    type: 'readwrite' | 'read',
  ): IDatabaseTransaction

  abstract transaction<TResult>(
    scopes: IDatabaseStore<DatabaseSchema>[],
    type: 'readwrite' | 'read',
    handler: (transaction: IDatabaseTransaction) => Promise<TResult>,
  ): Promise<TResult>

  abstract batch(): IDatabaseBatch

  abstract batch(
    writes: BatchOperation<
      DatabaseSchema,
      SchemaKey<DatabaseSchema>,
      SchemaValue<DatabaseSchema>
    >[],
  ): Promise<void>

  protected abstract _createStore<Schema extends DatabaseSchema>(
    options: IDatabaseStoreOptions<Schema>,
  ): IDatabaseStore<Schema>

  getStores(): Array<IDatabaseStore<DatabaseSchema>> {
    return Array.from(this.stores.values())
  }

  addStore<Schema extends DatabaseSchema>(
    options: IDatabaseStoreOptions<Schema>,
  ): IDatabaseStore<Schema> {
    if (this.isOpen) {
      throw new DatabaseIsOpenError(
        `Cannot add store ${options.name} while the database is open`,
      )
    }
    const existing = this.stores.get(options.name)
    if (existing) return existing as IDatabaseStore<Schema>

    const store = this._createStore<Schema>(options)
    this.stores.set(options.name, store)
    return store
  }

  /*
  Safety wrapper in case you don't know if you've been given a transaction or not
  This will create and commit it at the end if it if it hasn't been passed in.

  Usually this is solved by a context that's threaded through the application
  and keeps track of this, but we don't have a context.
  */
  async withTransaction<TResult>(
    transaction: IDatabaseTransaction | undefined | null,
    scopes: IDatabaseStore<DatabaseSchema>[],
    type: 'readwrite' | 'read',
    handler: (transaction: IDatabaseTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    const created = !transaction
    transaction = transaction || this.transaction(scopes, type)

    // TODO should we combine scopes if tx is not null but more scopes are given?

    try {
      const result = await handler(transaction)
      if (created) await transaction.commit()
      return result
    } catch (error: unknown) {
      if (created) await transaction.abort()
      throw error
    }
  }
}
