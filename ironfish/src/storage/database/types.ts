/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Serde, IJsonSerializable } from '../../serde'
import { IDatabase } from './database'
import { IDatabaseTransaction } from './transaction'

export type DatabaseKey = bigint | number | string | Date | Buffer | Array<IJsonSerializable>

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

export type IDatabaseEncoding<T> = Serde<T, Buffer>

export type KnownKeys<T> = {
  [K in keyof T]: string extends K ? never : number extends K ? never : K
} extends {
  [_ in keyof T]: infer U
}
  ? U
  : never
