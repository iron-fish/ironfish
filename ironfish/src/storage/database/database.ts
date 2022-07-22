/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BatchOperation, IDatabaseBatch } from './batch'
import { DatabaseIsOpenError } from './errors'
import { IDatabaseStore, IDatabaseStoreOptions } from './store'
import { IDatabaseTransaction } from './transaction'
import { DatabaseOptions, DatabaseSchema, SchemaKey, SchemaValue } from './types'

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
   * Check if the database needs to be upgraded
   */
  upgrade(version: number): Promise<void>

  getVersion(): Promise<number>
  putVersion(version: number, transaction?: IDatabaseTransaction): Promise<void>

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
   * @returns A new transaction
   */
  transaction(): IDatabaseTransaction

  /**
   * Starts a {@link IDatabaseTransaction} and executes your handler with it
   *
   * This is the safest transactional function because it guarantees when your
   * code finishes, the transaction will be either committed or aborted if an
   * exception has been thrown.
   *
   * @param handler You should pass in a function with your code that you want
   * to run in the transaction. The handler accepts a transaction and any returns
   * are forwarded out.
   *
   * @returns Forwards the result of your handler to it's return value
   */
  transaction<TResult>(
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
   * @param handler You should pass in a function with your code that you want
   * to run in the transaction. The handler accepts a transaction and any returns
   * are forwarded out.
   *
   * @returns Forwards the result of your handler to it's return value
   */
  withTransaction<TResult>(
    transaction: IDatabaseTransaction | undefined | null,
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
  abstract upgrade(version: number): Promise<void>
  abstract getVersion(): Promise<number>
  abstract putVersion(version: number): Promise<void>

  abstract transaction(): IDatabaseTransaction

  abstract transaction<TResult>(
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
    if (existing) {
      return existing as IDatabaseStore<Schema>
    }

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
    handler: (transaction: IDatabaseTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    const created = !transaction
    transaction = transaction || this.transaction()

    try {
      await transaction.acquireLock()
      const result = await handler(transaction)
      if (created) {
        await transaction.commit()
      }
      return result
    } catch (error: unknown) {
      if (created) {
        await transaction.abort()
      }
      throw error
    }
  }
}
