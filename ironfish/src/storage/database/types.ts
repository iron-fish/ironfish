/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { IJsonSerializable, Serde } from '../../serde'

export type DatabaseKey = bigint | number | string | Date | Buffer | Array<IJsonSerializable>

export type DatabaseSchema = {
  key: DatabaseKey
  value: unknown
}

export type SchemaKey<Schema extends DatabaseSchema> = Schema['key']
export type SchemaValue<Schema extends DatabaseSchema> = Schema['value']

export type DatabaseOptions = { [key: string]: unknown }

export type IDatabaseEncoding<T> = Serde<T, Buffer>
