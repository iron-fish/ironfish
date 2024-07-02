/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { AsyncExpectationResult, SyncExpectationResult } from 'expect'
import { diff } from 'jest-diff'
import { Blockchain } from '../../blockchain'
import { Block } from '../../primitives/block'
import { BlockHash } from '../../primitives/blockheader'
import { Nullifier } from '../../primitives/nullifier'
import { makeError, makeResult } from './utils'

function toEqualHash(
  self: BlockHash | null | undefined,
  other: BlockHash | null | undefined,
): SyncExpectationResult {
  let error: string | null = null

  if (!self || !other) {
    error = `Expected or actual == null:\n\nDifference:\n\n${String(diff(self, other))}`
  }

  if (!error && self && other && !self.equals(other)) {
    error = `Hashes do not match:\n\nDifference:\n\n${String(diff(self, other))}`
  }

  return makeError(error, `Expected two serde elements to match, but they didn't`)
}

function toEqualNullifier(self: Nullifier, other: Nullifier): SyncExpectationResult {
  let error: string | null = null

  if (!self || !other) {
    error = `Expected or actual == null:\n\nDifference:\n\n${String(diff(self, other))}`
  }

  if (!error && self && other && !self.equals(other)) {
    error = `Nullifiers do not match:\n\nDifference:\n\n${String(diff(self, other))}`
  }

  return makeError(error, `Expected two serde elements to match, but they didn't`)
}

async function toAddBlock(self: Blockchain, other: Block): AsyncExpectationResult {
  const result = await self.addBlock(other)

  if (!result.isAdded) {
    return makeResult(false, `Could not add block: ${String(result.reason)}`)
  }

  return makeResult(true, `Expected to not add block at ${String(other.header.sequence)}`)
}

async function toAddDoubleSpendBlock(self: Blockchain, other: Block): AsyncExpectationResult {
  // Mock data stores to allow creation of a double spend chain
  const transactionHashMock = jest
    .spyOn(self, 'transactionHashHasBlock')
    .mockResolvedValue(false)
  const containsMock = jest.spyOn(self.nullifiers['nullifiers'], 'has').mockResolvedValue(false)
  const addNullifierMock = jest
    .spyOn(self.nullifiers['nullifiers'], 'add')
    .mockImplementation((...args) => self.nullifiers['nullifiers'].put(...args))

  const result = await self.addBlock(other)

  transactionHashMock.mockRestore()
  containsMock.mockRestore()
  addNullifierMock.mockRestore()

  if (!result.isAdded) {
    return makeResult(false, `Could not add block: ${String(result.reason)}`)
  }

  return makeResult(true, `Expected to not add block at ${String(other.header.sequence)}`)
}

expect.extend({
  toEqualHash: toEqualHash,
  toEqualNullifier: toEqualNullifier,
  toAddBlock: toAddBlock,
  toAddDoubleSpendBlock: toAddDoubleSpendBlock,
})

declare module 'expect' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Matchers<R extends void | Promise<void>, T = unknown> {
    toEqualNullifier(other: Nullifier): R
    toEqualHash(other: BlockHash | null | undefined): R
    toAddBlock(block: Block): Promise<R>
    toAddDoubleSpendBlock(block: Block): Promise<R>
  }
}
