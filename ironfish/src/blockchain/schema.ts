/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BlockHash } from '../primitives/blockheader'
import { TransactionHash } from '../primitives/transaction'
import { DatabaseSchema } from '../storage'
import { AssetValue } from './database/assetValue'
import { HeaderValue } from './database/headers'
import { SequenceToHashesValue } from './database/sequenceToHashes'
import { TransactionsValue } from './database/transactions'

export interface MetaSchema extends DatabaseSchema {
  key: 'head' | 'latest'
  value: BlockHash
}

export interface HeadersSchema extends DatabaseSchema {
  key: BlockHash
  value: HeaderValue
}

export interface TransactionsSchema extends DatabaseSchema {
  key: BlockHash
  value: TransactionsValue
}

export interface SequenceToHashesSchema extends DatabaseSchema {
  key: number
  value: SequenceToHashesValue
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

export interface AssetSchema extends DatabaseSchema {
  key: Buffer
  value: AssetValue
}

export interface TransactionHashToBlockHashSchema extends DatabaseSchema {
  key: TransactionHash
  value: BlockHash
}
