/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

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

  /**
   * The number of pending operations
   */
  readonly size: number
}
