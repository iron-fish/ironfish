/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import diff from 'jest-diff'
import { Blockchain } from '../../blockchain'
import { Block } from '../../primitives/block'
import { BlockHash } from '../../primitives/blockheader'
import { Nullifier } from '../../primitives/nullifier'
import { makeError, makeResult } from './utils'

function toEqualHash(
  self: BlockHash | null | undefined,
  other: BlockHash | null | undefined,
): jest.CustomMatcherResult {
  let error: string | null = null

  if (!self || !other) {
    error = `Expected or actual == null:\n\nDifference:\n\n${String(diff(self, other))}`
  }

  if (!error && self && other && !self.equals(other)) {
    error = `Hashes do not match:\n\nDifference:\n\n${String(diff(self, other))}`
  }

  return makeError(error, `Expected two serde elements to match, but they didn't`)
}

function toEqualNullifier(self: Nullifier, other: Nullifier): jest.CustomMatcherResult {
  let error: string | null = null

  if (!self || !other) {
    error = `Expected or actual == null:\n\nDifference:\n\n${String(diff(self, other))}`
  }

  if (!error && self && other && !self.equals(other)) {
    error = `Nullifiers do not match:\n\nDifference:\n\n${String(diff(self, other))}`
  }

  return makeError(error, `Expected two serde elements to match, but they didn't`)
}

function toEqualBlock(self: Block, other: Block): jest.CustomMatcherResult {
  let error: string | null = null

  if (!self.header.strategy.blockSerde.equals(self, other)) {
    error = `Blocks do not match:\n\nDifference:\n\n${String(diff(self, other))}`
  }

  return makeError(error, `Expected two blocks to match, but they didn't`)
}

async function toAddBlock(self: Blockchain, other: Block): Promise<jest.CustomMatcherResult> {
  const result = await self.addBlock(other)

  if (!result.isAdded) {
    return makeResult(false, `Could not add block: ${String(result.reason)}`)
  }

  return makeResult(true, `Expected to not add block at ${String(other.header.sequence)}`)
}

expect.extend({
  toEqualHash: toEqualHash,
  toEqualNullifier: toEqualNullifier,
  toEqualBlock: toEqualBlock,
  toAddBlock: toAddBlock,
})

declare global {
  namespace jest {
    interface Matchers<R> {
      toEqualNullifier(other: Nullifier): R
      toEqualHash(other: BlockHash | null | undefined): R
      toEqualBlock(block: Block): Promise<R>
      toAddBlock(block: Block): Promise<R>
    }
  }
}
