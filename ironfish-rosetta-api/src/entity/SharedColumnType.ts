/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ColumnOptions } from 'typeorm'
import { timestamp } from './ValueTransformer'

// Hash stored as hex output
export const Hash: ColumnOptions = {
  length: 64,
  type: 'varchar',
}

export const Timestamp: ColumnOptions = {
  type: 'timestamptz',
  transformer: timestamp,
}
