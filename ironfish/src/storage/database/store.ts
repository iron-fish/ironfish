/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  DatabaseSchema,
  IDatabaseStore,
  IDatabaseEncoding,
  IDatabaseStoreOptions,
  IDatabaseTransaction,
  SchemaKey,
  SchemaValue,
  KnownKeys,
  UpgradeFunction,
} from './types'

export abstract class DatabaseStore<Schema extends DatabaseSchema>
  implements IDatabaseStore<Schema> {
  version: number
  name: string
  upgrade: UpgradeFunction | null
  keyEncoding: IDatabaseEncoding<SchemaKey<Schema>>
  valueEncoding: IDatabaseEncoding<SchemaValue<Schema>>
  keyPath: KnownKeys<SchemaValue<Schema>> | KnownKeys<SchemaValue<Schema>>[] | null

  constructor(options: IDatabaseStoreOptions<Schema>) {
    this.version = options.version
    this.name = options.name
    this.upgrade = options.upgrade || null
    this.keyEncoding = options.keyEncoding
    this.valueEncoding = options.valueEncoding
    this.keyPath = options.keyPath || null
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

  abstract put(value: SchemaValue<Schema>, transaction?: IDatabaseTransaction): Promise<void>

  abstract add(
    key: SchemaKey<Schema>,
    value: SchemaValue<Schema>,
    transaction?: IDatabaseTransaction,
  ): Promise<void>

  abstract add(value: SchemaValue<Schema>, transaction?: IDatabaseTransaction): Promise<void>

  abstract del(key: SchemaKey<Schema>, transaction?: IDatabaseTransaction): Promise<void>

  protected makeKey(value: SchemaValue<Schema>): SchemaKey<Schema> {
    if (this.keyPath === null) {
      throw new Error(`No keypath defined`)
    }

    if (Array.isArray(this.keyPath)) {
      return this.keyPath.map((path) => value[path])
    }

    return value[this.keyPath]
  }
}
