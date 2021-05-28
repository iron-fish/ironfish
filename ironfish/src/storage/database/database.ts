/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { DatabaseOptions, DatabaseSchema, SchemaKey, SchemaValue } from './types'
import { DatabaseIsOpenError } from './errors'
import { IDatabaseStore, IDatabaseStoreOptions } from './store'
import { IDatabaseTransaction } from './transaction'
import { BatchOperation, IDatabaseBatch } from './batch'

/**
 * A database interface to represent a wrapper for a key value store database. The database is the entry point for creating stores, batches, transactions.
 *
 * The general idea is that you should create a database and add [[`IDatabaseStore`]]s to it. The stores are where all the operations occur, and accept transactions.

* Three important functions on this interface are
* * [[`IDatabase.addStore`]]
* * [[`IDatabase.transaction`]]
* * [[`IDatabase.batch`]]
*/
export interface IDatabase {
  /**
   * If the datbase is open and available for operations
   */
  readonly isOpen: boolean

  /**
   * Opens a connection to the database with the given options
   *
   * Your provided upgrade function in [[`DatabaseOptions.upgrade`]] will be called if
   * the version you provide is larger than the stored version.
   */
  open(options?: DatabaseOptions): Promise<void>

  /** Closes the database and does not handle any open transactions */
  close(): Promise<void>

  /**
   * Add an {@link IDatabaseStore} to the database
   *
   * You can only add a store to the database if the database is not open. This is because some databases only
   * allow initializing new stores when the database is being opened.
   * @param options The options for the new store
   */
  addStore<Schema extends DatabaseSchema>(
    options: IDatabaseStoreOptions<Schema>,
  ): IDatabaseStore<Schema>

  /** Get all the stores added with [[`IDatabase.addStore`]] */
  getStores(): Array<IDatabaseStore<DatabaseSchema>>

  /**
   * Starts a {@link IDatabaseTransaction} and returns it.
   *
   * @warning If you use this then it's up to you to manage the transactions life cycle.
   * You should not forget to call [[`IDatabaseTransaction.commit`]] or [[`IDatabaseTransaction.abort`]].
   * If you don't you will deadlock the database. This is why it's better and safer to use [[`IDatabase.transaction::OVERLOAD_2`]]
   *
   * @param scopes The stores you intend to access. Your operation will fail if it's not a store that is not specified here.
   * @param type Indicates which type of access you are going to perform. You can only do writes in readwrite.
   *
   * @returns A new transaction
   */
  transaction(
    scopes: IDatabaseStore<DatabaseSchema>[],
    type: 'readwrite' | 'read',
  ): IDatabaseTransaction

  /**
   * Starts a {@link IDatabaseTransaction} and executes your handler with it
   *
   * This is the safest transactional function because it guarantees when your
   * code finishes, the transaction will be either committed or aborted if an
   * exception has been thrown.
   *
   * @param scopes The stores you intend to access Your operation will fail if
   * it's not a store that is not specified here.
   * @param type Indicates which type of access you are going to perform. You
   * can only do writes in readwrite.
   * @param handler You should pass in a function with your code that you want
   * to run in the transaction. The handler accepts a transaction and any returns
   * are forwarded out.
   *
   * @returns Forwards the result of your handler to it's return value
   */
  transaction<TResult>(
    scopes: IDatabaseStore<DatabaseSchema>[],
    type: 'readwrite' | 'read',
    handler: (transaction: IDatabaseTransaction) => Promise<TResult>,
  ): Promise<TResult>

  /**
   * Uses an existing transaction or starts a transaction and executes your
   * handler with it. It commits or aborts the transaction only if a call to
   * this function has created one.
   *
   * Use this when you are given an optional transaction, where you may want
   * to create one if one has not been created.
   *
   * @param scopes The stores you intend to access Your operation will fail if
   * it's not a store that is not specified here.
   * @param type Indicates which type of access you are going to perform. You
   * can only do writes in readwrite.
   * @param handler You should pass in a function with your code that you want
   * to run in the transaction. The handler accepts a transaction and any returns
   * are forwarded out.
   *
   * @returns Forwards the result of your handler to it's return value
   */
  withTransaction<TResult>(
    transaction: IDatabaseTransaction | undefined | null,
    scopes: IDatabaseStore<DatabaseSchema>[],
    type: 'readwrite' | 'read',
    handler: (transaction: IDatabaseTransaction) => Promise<TResult>,
  ): Promise<TResult>

  /** Creates a batch of commands that are executed atomically
   * once it's commited using {@link IDatabaseBatch.commit}
   *
   * @see [[`IDatabaseBatch`]] for what operations are supported
   */
  batch(): IDatabaseBatch

  /**
   * Executes a batch of database operations atomically
   *
   * @returns A promise that resolves when the operations are commited to the database
   */
  batch(
    writes: BatchOperation<
      DatabaseSchema,
      SchemaKey<DatabaseSchema>,
      SchemaValue<DatabaseSchema>
    >[],
  ): Promise<void>
}

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
