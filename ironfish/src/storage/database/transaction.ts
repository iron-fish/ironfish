/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { IDatabaseStore } from './store'
import { DatabaseSchema, SchemaKey, SchemaValue } from './types'

/**
 * Stores all operations applied to the transaction and then applies
 * them atomically to the database once it's committed. Locks the
 * database when the first operation in the transaction is started.
 *
 * You must release the lock by calling [[`IDatabaseTransaction.commit`]]
 * or [[`IDatabaseTransaction.abort`]]
 *
 * Start a transaction by using {@link IDatabase.transaction} or the less used {@link IDatabase.withTransaction}
 *
 * @note Unlike most relational database transactions, the state is
 * not guaranteed to be consistent at time the transaction was
 * started. A row is frozen into the transaction when the first read
 * or write is performed on it.
 */
export interface IDatabaseTransaction {
  cache: Map<Buffer, unknown>

  /**
   * Lock the database
   */
  acquireLock(): Promise<void>

  /**
   * Commit the transaction atomically to the database but do not release the database lock
   * */
  update(): Promise<void>

  /**
   * Commit the transaction atomically to the database and release the database lock
   * */
  commit(): Promise<void>

  /**
   * Abort the transaction and release the database lock
   * */
  abort(): Promise<void>

  has<Schema extends DatabaseSchema>(
    store: IDatabaseStore<Schema>,
    key: SchemaKey<Schema>,
  ): Promise<boolean>

  get<Schema extends DatabaseSchema>(
    store: IDatabaseStore<Schema>,
    key: SchemaKey<Schema>,
  ): Promise<SchemaValue<Schema> | undefined>

  put<Schema extends DatabaseSchema>(
    store: IDatabaseStore<Schema>,
    key: SchemaKey<Schema>,
    value: SchemaValue<Schema>,
  ): Promise<void>

  add<Schema extends DatabaseSchema>(
    store: IDatabaseStore<Schema>,
    key: SchemaKey<Schema>,
    value: SchemaValue<Schema>,
  ): Promise<void>

  del<Schema extends DatabaseSchema>(
    store: IDatabaseStore<Schema>,
    key: SchemaKey<Schema>,
  ): Promise<void>

  /**
   * The number of pending operations
   */
  readonly size: number
}
