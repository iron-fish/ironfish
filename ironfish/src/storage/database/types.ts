/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Serde, { IJsonSerializable } from '../../serde'

export type DatabaseKey = number | string | Date | Buffer | Array<IJsonSerializable>

export type DatabaseSchema = {
  key: DatabaseKey
  value: unknown
}

export type SchemaKey<Schema extends DatabaseSchema> = Schema['key']
export type SchemaValue<Schema extends DatabaseSchema> = Schema['value']

export type UpgradeFunction = (
  db: IDatabase,
  oldVersion: number,
  newVersion: number,
  transaction: IDatabaseTransaction,
) => Promise<void>

export type DatabaseOptions = {
  upgrade?: UpgradeFunction
} & { [key: string]: unknown }

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

export type IDatabaseEncoding<T> = Serde<T, Buffer>

export interface IDatabaseBatch {
  /**
   * Put a value into the database with the given key.

  * @param store - The [[`IDatabaseStore`]] to put the value into
  * @param key - The key to insert
  * @param value - The value to insert
  *
  * @returns The batch for chaining operations onto
  */
  put<Schema extends DatabaseSchema>(
    store: IDatabaseStore<Schema>,
    key: SchemaKey<Schema>,
    value: SchemaValue<Schema>,
  ): IDatabaseBatch

  /**
   * Delete a value in the database with the given key.

  * @param store - The [[`IDatabaseStore`]] to delete the key from
  * @param key - The key to delete
  *
  * @returns The batch for chaining operations onto
  */
  del<Schema extends DatabaseSchema>(
    store: IDatabaseStore<Schema>,
    key: SchemaKey<Schema>,
  ): IDatabaseBatch

  /** Commit the batch atomically to the database */
  commit(): Promise<void>
}

export type BatchOperation<
  Schema extends DatabaseSchema,
  Key extends SchemaKey<Schema>,
  Value extends SchemaValue<Schema>
> = [IDatabaseStore<Schema>, Key, Value] | [IDatabaseStore<Schema>, Key]

/**
 * A collection of keys with associated values that exist within a {@link IDatabase}
 * you can have many of these inside of a database. All the values inside the store
 * have a consistent type specified by the <Schema> generic parameter.
 *
 * Use [[`IDatabase.addStore`]] before you open the database to create an [[`IDatabaseStore`]]
 *
 * You can operate on one or more stores atomically using {@link IDatabase.transaction}
 */
export interface IDatabaseStore<Schema extends DatabaseSchema> {
  /** The schema version of the store. @see {@link IDatabase.addStore} for more information*/
  version: number
  /** The name of the store inside of the {@link IDatabase} */
  name: string
  /** Run when when {@link IDatabaseStore.version} changes */
  upgrade: UpgradeFunction | null
  /** The [[`IDatabaseEncoding`]] used to serialize keys to store in the database */
  keyEncoding: IDatabaseEncoding<SchemaKey<Schema>>
  /** The [[`IDatabaseEncoding`]] used to serialize values to store in the database */
  valueEncoding: IDatabaseEncoding<SchemaValue<Schema>>

  encode(key: SchemaKey<Schema>): [Buffer]

  /**
   * Used to serialize the key and value for the database
   *
   * @returns An array with the serialized key and value as Buffers
   */
  encode(key: SchemaKey<Schema>, value: SchemaValue<Schema>): [Buffer, Buffer]

  /* Get an [[`AsyncGenerator`]] that yields all of the key/value pairs in the IDatastore */
  getAllIter(
    transaction?: IDatabaseTransaction,
  ): AsyncGenerator<[SchemaKey<Schema>, SchemaValue<Schema>]>

  /* Get an [[`AsyncGenerator`]] that yields all of the values in the IDatastore */
  getAllValuesIter(transaction?: IDatabaseTransaction): AsyncGenerator<SchemaValue<Schema>>
  /* Get all of the values in the IDatastore */
  getAllValues(transaction?: IDatabaseTransaction): Promise<Array<SchemaValue<Schema>>>

  /* Get an [[`AsyncGenerator`]] that yields all of the keys in the IDatastore */
  getAllKeysIter(transaction?: IDatabaseTransaction): AsyncGenerator<SchemaKey<Schema>>
  /* Get all of the keys in the IDatastore */
  getAllKeys(transaction?: IDatabaseTransaction): Promise<Array<SchemaKey<Schema>>>

  /**
   * Delete every key in the {@link IDatastore}
   *
   * @returns resolves when all keys have been deleted
   */
  clear(): Promise<void>

  /**
   * Used to get a value from the store at a given key

  * @param key - The key to fetch
  * @param transaction - If provided, the operation will use the transaction.
  *
  * @returns resolves with the value if found, or undefined if not found.
  */
  get(
    key: SchemaKey<Schema>,
    transaction?: IDatabaseTransaction,
  ): Promise<SchemaValue<Schema> | undefined>

  /**
   * Used to check if the the database has a given key

  * @param key - The key to check
  * @param transaction - If provided, the operation will use the transaction.
  *
  * @returns resolves with true if the key is in the database, or false if it is missing.
  */
  has(key: SchemaKey<Schema>, transaction?: IDatabaseTransaction): Promise<boolean>

  /**
   * Put a value into the store with the given key.

  * @param key - The key to insert
  * @param value - The value to insert
  * @param transaction - If provided, the operation will be executed atomically when the transaction is {@link IDatabaseTransaction.commit | committed}.
  *
  * @returns A promise that resolves when the operation has been either executed, or added to the transaction.
  */
  put(
    key: SchemaKey<Schema>,
    value: SchemaValue<Schema>,
    transaction?: IDatabaseTransaction,
  ): Promise<void>

  /**
   * Add a value to the database and calculate it's key using the `keyPath` specified for the IDataStore. See the documentation on specifying keyPaths in {@link IDatabase.addStore} for more info.
   *
   * @param value - The value to insert
   * @param transaction - If provided, the operation will be executed atomically when the transaction is {@link IDatabaseTransaction.commit | committed}.
   *
   * @returns A promise that resolves when the operation has been either executed, or added to the transaction.
   * @throws {@link DuplicateKeyError} if the key already exists in the transaction or database
   */
  put(value: SchemaValue<Schema>, transaction?: IDatabaseTransaction): Promise<void>

  /**
   * Add a value to the database with the given key.
   *
   * If the key already exists, an {@link DuplicateKeyError} will be thrown. If you do not want to throw an error on insert, use {@link IDatabaseStore.put}

  * @param key - The key to insert
  * @param value - The value to insert
  * @param transaction - If provided, the operation will be executed atomically when the transaction is {@link IDatabaseTransaction.commit | committed}.
  *
  * @returns A promise that resolves when the operation has been either executed, or added to the transaction.
  * @throws {@link DuplicateKeyError} if the key already exists in the transaction or database
  */
  add(
    key: SchemaKey<Schema>,
    value: SchemaValue<Schema>,
    transaction?: IDatabaseTransaction,
  ): Promise<void>

  /**
   * Add a value to the database and calculate it's key using the `keyPath` specified for the IDataStore. See the documentation on specifying keypaths in {@link IDatabase.addStore} for more info.
   *
   * If the key already exists, an {@link DuplicateKeyError} will be thrown. If you do not want to throw an error on insert, use {@link IDatabaseStore.put}
   *
   * @param value - The value to insert
   * @param transaction - If provided, the operation will be executed atomically when the transaction is {@link IDatabaseTransaction.commit | committed}.
   *
   * @returns A promise that resolves when the operation has been either executed, or added to the transaction.
   * @throws {@link DuplicateKeyError} if the key already exists in the transaction or database
   */
  add(value: SchemaValue<Schema>, transaction?: IDatabaseTransaction): Promise<void>

  /**
   * Delete a value with the given key.
   *
   * @param key - The key stored in the database to delete
   * @param transaction - If provided, the operation will be executed atomically when the transaction is {@link IDatabaseTransaction.commit | committed}.
   *
   * @returns A promise that resolves when the operation has been either executed, or added to the transaction.
   */
  del(key: SchemaKey<Schema>, transaction?: IDatabaseTransaction): Promise<void>
}

export type IDatabaseStoreOptions<Schema extends DatabaseSchema> = {
  /** The schema version of the store. @see {@link IDatabase.addStore} for more information*/
  version: number
  /** The unique name of the store inside of the database */
  name: string
  /** The encoding used to encode and decode keys in the database */
  keyEncoding: IDatabaseEncoding<SchemaKey<Schema>>
  /** The encoding used to encode and decode values in the database */
  valueEncoding: IDatabaseEncoding<SchemaValue<Schema>>
  /** Used to auto construct a key from a value inside the store if specified. It can either be a field from the value, or an array of fields from the value */
  keyPath?: KnownKeys<SchemaValue<Schema>> | KnownKeys<SchemaValue<Schema>>[]
  upgrade?: UpgradeFunction
}

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
  /** Commit the transaction atomically to the database and release the database lock */
  commit(): Promise<void>
  /** Abort the transaction and release the database lock */
  abort(): Promise<void>
}

export type KnownKeys<T> = {
  [K in keyof T]: string extends K ? never : number extends K ? never : K
} extends {
  [_ in keyof T]: infer U
}
  ? U
  : never
