/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { IDatabaseTransaction } from './transaction'
import { DatabaseSchema, IDatabaseEncoding, SchemaKey, SchemaValue } from './types'

export type IDatabaseStoreOptions<Schema extends DatabaseSchema> = {
  /** The unique name of the store inside of the database */
  name: string
  /** The encoding used to encode and decode keys in the database */
  keyEncoding: IDatabaseEncoding<SchemaKey<Schema>>
  /** The encoding used to encode and decode values in the database */
  valueEncoding: IDatabaseEncoding<SchemaValue<Schema>>
}

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
  /** The unique name of the store inside of the database */
  name: string
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
   * Delete a value with the given key.
   *
   * @param key - The key stored in the database to delete
   * @param transaction - If provided, the operation will be executed atomically when the transaction is {@link IDatabaseTransaction.commit | committed}.
   *
   * @returns A promise that resolves when the operation has been either executed, or added to the transaction.
   */
  del(key: SchemaKey<Schema>, transaction?: IDatabaseTransaction): Promise<void>
}

export abstract class DatabaseStore<Schema extends DatabaseSchema>
  implements IDatabaseStore<Schema>
{
  name: string
  keyEncoding: IDatabaseEncoding<SchemaKey<Schema>>
  valueEncoding: IDatabaseEncoding<SchemaValue<Schema>>

  constructor(options: IDatabaseStoreOptions<Schema>) {
    this.name = options.name
    this.keyEncoding = options.keyEncoding
    this.valueEncoding = options.valueEncoding
  }

  abstract encode(key: SchemaKey<Schema>): [Buffer]
  abstract encode(key: SchemaKey<Schema>, value: SchemaValue<Schema>): [Buffer, Buffer]

  abstract get(
    key: SchemaKey<Schema>,
    transaction?: IDatabaseTransaction,
  ): Promise<SchemaValue<Schema> | undefined>

  abstract getAllIter(
    transaction?: IDatabaseTransaction,
  ): AsyncGenerator<[SchemaKey<Schema>, SchemaValue<Schema>]>

  abstract getAllValuesIter(
    transaction?: IDatabaseTransaction,
  ): AsyncGenerator<SchemaValue<Schema>>
  abstract getAllValues(transaction?: IDatabaseTransaction): Promise<Array<SchemaValue<Schema>>>

  abstract getAllKeysIter(transaction?: IDatabaseTransaction): AsyncGenerator<SchemaKey<Schema>>
  abstract getAllKeys(transaction?: IDatabaseTransaction): Promise<Array<SchemaKey<Schema>>>

  abstract clear(): Promise<void>

  abstract has(key: SchemaKey<Schema>, transaction?: IDatabaseTransaction): Promise<boolean>

  abstract put(
    key: SchemaKey<Schema>,
    value: SchemaValue<Schema>,
    transaction?: IDatabaseTransaction,
  ): Promise<void>

  abstract add(
    key: SchemaKey<Schema>,
    value: SchemaValue<Schema>,
    transaction?: IDatabaseTransaction,
  ): Promise<void>

  abstract del(key: SchemaKey<Schema>, transaction?: IDatabaseTransaction): Promise<void>
}
