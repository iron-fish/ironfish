/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BlockHash, BlockHeader } from '../primitives/blockheader'
import { Transaction } from '../primitives/transaction'
import { DatabaseSchema } from '../storage'

export interface MetaSchema extends DatabaseSchema {
  key: 'head' | 'latest'
  value: BlockHash
}

export interface HeadersSchema extends DatabaseSchema {
  key: BlockHash
  value: BlockHeader
}

export interface TransactionsSchema extends DatabaseSchema {
  key: BlockHash
  value: Transaction[]
}

export interface SequenceToHashesSchema extends DatabaseSchema {
  key: number
  value: BlockHash[]
}

// Main Chain
export interface SequenceToHashSchema extends DatabaseSchema {
  key: number
  value: BlockHash
}

// Main Chain
export interface HashToNextSchema extends DatabaseSchema {
  key: BlockHash
  value: BlockHash
}
