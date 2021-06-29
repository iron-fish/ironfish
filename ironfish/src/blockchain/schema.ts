/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BlockHash, BlockHeader } from '../primitives/blockheader'
import { Transaction } from '../primitives/transaction'
import { JsonSerializable } from '../serde'
import { DatabaseSchema } from '../storage'

export const SCHEMA_VERSION = 2

export interface MetaSchema extends DatabaseSchema {
  key: 'head' | 'latest'
  value: BlockHash
}

export interface HeadersSchema<
  E,
  H,
  T extends Transaction<E, H>,
  SE extends JsonSerializable,
  SH extends JsonSerializable,
  ST,
> extends DatabaseSchema {
  key: BlockHash
  value: BlockHeader<E, H, T, SE, SH, ST>
}

export interface TransactionsSchema<T> extends DatabaseSchema {
  key: BlockHash
  value: T[]
}

export interface HeightToHashesSchema extends DatabaseSchema {
  key: number
  value: BlockHash[]
}

// Main Chain
export interface HeightToHashSchema extends DatabaseSchema {
  key: number
  value: BlockHash
}

// Main Chain
export interface HashToNextSchema extends DatabaseSchema {
  key: BlockHash
  value: BlockHash
}
