/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import diff from 'jest-diff'
import { zip } from 'lodash'

import { Blockchain } from '../../../blockchain'
import { Block } from '../../../primitives/block'
import { BlockHash, Sequence } from '../../../primitives/blockheader'
import { Nullifier } from '../../../primitives/nullifier'
import { SerializedTestTransaction, TestTransaction } from '../strategy'
import makeError from './makeError'
import { BlockHashSerdeInstance, BufferSerde } from '../../../serde'

declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveNoSignOfHash(hash: BlockHash, sequence: number): Promise<R>
      toEqualNullifier(other: Nullifier): R
      toEqualHash(other: BlockHash): R
      toHaveChainLengths(blocks: number, heads: number, sequences: number): Promise<R>
      toHaveBlockCounts(hash: BlockHash, notes: number, nullifiers: number): Promise<R>
      toHaveChainHeads(heads: [BlockHash, BlockHash][]): Promise<R>
      toEqualBlock(
        block: Block<
          string,
          string,
          TestTransaction,
          string,
          string,
          SerializedTestTransaction
        >,
      ): Promise<R>
      toHaveSequences(sequences: [number, BlockHash[]][]): Promise<R>
    }
  }
}

expect.extend({
  async toHaveNoSignOfHash(
    chain: Blockchain<
      string,
      string,
      TestTransaction,
      string,
      string,
      SerializedTestTransaction
    >,
    hash: BlockHash,
    sequence: Sequence,
  ): Promise<jest.CustomMatcherResult> {
    let error: string | null = null
    if ((await chain.getBlock(hash)) !== null) {
      error = `Expected block ${String(hash)} to be null`
    } else if (await chain.headers.get(hash)) {
      error = `Expected block header ${String(hash)} not to be in the db`
    } else if (await chain.transactions.get(hash)) {
      error = `Expected transactions ${String(hash)} not to be in the db`
    } else {
      const hashesForSequence = await chain.sequenceToHash.get(sequence.toString())
      if (hashesForSequence) {
        for (const candidate of hashesForSequence) {
          if (error !== null) break
          if (BlockHashSerdeInstance.equals(candidate, hash)) {
            error = `Hash ${String(hash)} exists in sequences index for ${sequence}`
          }
        }
      }
    }

    return makeError(error, `expect ${String(hash)} and ${sequence} not to be gone`)
  },
  toEqualHash(self: BlockHash, other: BlockHash): jest.CustomMatcherResult {
    const serde = new BufferSerde(32)
    let error: string | null = null
    if (!serde.equals(self, other)) {
      const diffString = diff(self, other)
      error = `Serde results do not match:\n\nDifference:\n\n${String(diffString)}`
    }
    return makeError(error, `Expected two serde elements to match, but they didn't`)
  },
  toEqualNullifier(self: Nullifier, other: Nullifier): jest.CustomMatcherResult {
    const serde = new BufferSerde(32)
    let error: string | null = null
    if (!serde.equals(self, other)) {
      const diffString = diff(self, other)
      error = `Serde results do not match:\n\nDifference:\n\n${String(diffString)}`
    }
    return makeError(error, `Expected two serde elements to match, but they didn't`)
  },
  toEqualBlock(
    self: Block<string, string, TestTransaction, string, string, SerializedTestTransaction>,
    other: Block<string, string, TestTransaction, string, string, SerializedTestTransaction>,
  ): jest.CustomMatcherResult {
    const serde = self.header.strategy.blockSerde
    let error: string | null = null
    if (!serde.equals(self, other)) {
      const diffString = diff(self, other)
      error = `Blocks do not match:\n\nDifference:\n\n${String(diffString)}`
    }
    return makeError(error, `Expected two blocks to match, but they didn't`)
  },

  async toHaveChainLengths(
    chain: Blockchain<
      string,
      string,
      TestTransaction,
      string,
      string,
      SerializedTestTransaction
    >,
    blocks: number,
    heads: number,
    sequences: number,
  ): Promise<jest.CustomMatcherResult> {
    let error: string | null = null

    const numHeaders = (await chain.headers.getAllKeys()).length
    const numTransactions = (await chain.transactions.getAllKeys()).length
    const numSequences = (await chain.sequenceToHash.getAllKeys()).length

    if (numHeaders !== blocks) {
      error = `Chain has ${numHeaders} headers, but should have ${blocks}`
    } else if (numTransactions !== blocks) {
      error = `Chain has ${numTransactions} transactions, but should have ${blocks}`
    } else if (numSequences !== sequences) {
      error = `Chain has ${numSequences} sequences, but should have ${sequences}`
    }

    return makeError(error, `Expected chain length not to match`)
  },
  async toHaveBlockCounts(
    chain: Blockchain<
      string,
      string,
      TestTransaction,
      string,
      string,
      SerializedTestTransaction
    >,
    hash: BlockHash,
    notes: number,
    nullifiers: number,
  ): Promise<jest.CustomMatcherResult> {
    let error: string | null = null
    const block = await chain.getBlock(hash)
    const counts = block?.counts()

    if (counts === undefined) {
      error = `${String(hash)} does not have any Counts`
    } else if (counts.notes !== notes) {
      error = `${String(hash)} has ${counts.notes} notes, but expected ${notes}`
    } else if (counts.nullifiers !== nullifiers) {
      error = `${String(hash)} has ${counts.nullifiers} nullifiers, but expected ${nullifiers}`
    }
    return makeError(error, `Expected counts not to match`)
  },

  async toHaveSequences(
    chain: Blockchain<
      string,
      string,
      TestTransaction,
      string,
      string,
      SerializedTestTransaction
    >,
    sequences: [number, BlockHash[]][],
  ) {
    let error: string | null = null
    for (const [sequence, hashes] of sequences) {
      if (error !== null) break
      const actualHashes = await chain.sequenceToHash.get(sequence.toString())
      if (actualHashes === undefined) {
        error = `There are no hashes for sequence ${sequence}`
      } else if (actualHashes.length !== hashes.length) {
        error = `There are ${actualHashes.length} hashes for sequence ${sequence}, but there should be ${hashes.length}`
      } else {
        actualHashes.sort()
        hashes.sort()
        for (const [actual, expected] of zip(actualHashes, hashes)) {
          if (error !== null) break
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          if (!BlockHashSerdeInstance.equals(Buffer.from(actual!), Buffer.from(expected!))) {
            const diffString = diff(actual, expected)
            error = `Hashes for sequence ${sequence} don't match\n\nDifference:\n\n${String(
              diffString,
            )}`
          }
        }
      }
    }
    return makeError(error, `Expected chain sequences not to match`)
  },
})
