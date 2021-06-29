/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { IDatabaseStore } from './store'
import { DatabaseSchema, SchemaKey, SchemaValue } from './types'

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
  Value extends SchemaValue<Schema>,
> = [IDatabaseStore<Schema>, Key, Value] | [IDatabaseStore<Schema>, Key]
