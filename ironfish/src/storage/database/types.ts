/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { IJsonSerializable } from '../../serde'

export interface DatabaseKeyRange {
  gt?: Buffer
  gte?: Buffer
  lt?: Buffer
  lte?: Buffer
}

export interface DatabaseIteratorOptions {
  reverse?: boolean
  limit?: number
  ordered?: boolean
}

export type DatabaseKey = bigint | number | string | Date | Buffer | Array<IJsonSerializable>

export type DatabaseSchema<key extends DatabaseKey = DatabaseKey, value = unknown> = {
  key: key
  value: value
}

export type SchemaKey<Schema extends DatabaseSchema> = Schema['key']
export type SchemaValue<Schema extends DatabaseSchema> = Schema['value']

export type DatabaseOptions = { [key: string]: unknown }

export type IDatabaseEncoding<T> = {
  serialize(value: T): Buffer
  deserialize(buffer: Buffer): T
}
