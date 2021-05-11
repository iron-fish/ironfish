/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BlockHash, SerializedBlockHeader } from '../primitives/blockheader'
import { DatabaseSchema } from '../storage'
import { SerializedCounts } from '../primitives/block'
import { Graph } from './graph'

export const SCHEMA_VERSION = 1

export interface MetaSchema extends DatabaseSchema {
  key: 'head' | 'latest'
  value: BlockHash
}

export interface HeadersSchema<SH> extends DatabaseSchema {
  key: BlockHash
  value: SerializedBlockHeader<SH>
}

export interface TransactionsSchema<ST> extends DatabaseSchema {
  key: BlockHash
  value: ST[] // Whatever the strategy chooses
}

export interface ChainTailsSchema extends DatabaseSchema {
  key: BlockHash // the block hash that you want to find the tail for
  value: BlockHash // The tail of the chain that starts at the key's head
}

export interface CountsSchema extends DatabaseSchema {
  key: BlockHash
  value: SerializedCounts
}

// Essentially an index, but one sequence can have multiple hashes
export interface SequenceToHashSchema extends DatabaseSchema {
  key: string
  value: BlockHash[]
}

// Essentially an index, but one sequence can have multiple hashes
export interface SequenceToHash2Schema extends DatabaseSchema {
  key: string
  value: BlockHash
}

// Essentially an index, but one sequence can have multiple hashes
export interface HashToNextSchema extends DatabaseSchema {
  key: BlockHash
  value: BlockHash[]
}

export interface GraphSchema extends DatabaseSchema {
  key: string
  value: Graph
}
