/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MemPool } from '../memPool'
import { RangeHasher } from '../merkletree'
import { Nullifier } from '../primitives/nullifier'
import {
  makeChainFull,
  makeNullifier,
  TestBlockchain,
  TestMemPool,
  TestStrategy,
  TestTransaction,
} from '../testUtilities/fake'

// Number of notes and nullifiers on the initial chain created by makeFullChain
const TEST_CHAIN_NUM_NULLIFIERS = 16

describe('MemPool', () => {
  const strategy = new TestStrategy(new RangeHasher())
  let chain: TestBlockchain
  let memPool: TestMemPool

  beforeEach(async () => {
    chain = await makeChainFull(strategy)

    memPool = new MemPool({
      chain: chain,
      strategy: chain.strategy,
    })
  })

  it('is not valid if the spend was seen in other transactions in this block', async () => {
    const transaction = new TestTransaction(true, ['abc', 'def'], 50, [
      { nullifier: makeNullifier(8), commitment: '0-3', size: 4 },
    ])

    const beforeSize = TEST_CHAIN_NUM_NULLIFIERS
    const seenNullifiers = [makeNullifier(8)]
    const isValid = await memPool.isValidTransaction(transaction, beforeSize, seenNullifiers)
    expect(isValid).toBe(false)
  })

  it('is not valid if the spend was seen in a previous block', async () => {
    const aPreviousNullifier = await chain.nullifiers.get(4)

    const transaction = new TestTransaction(true, ['abc', 'def'], 50, [
      { nullifier: aPreviousNullifier, commitment: '0-3', size: 4 },
    ])

    const beforeSize = TEST_CHAIN_NUM_NULLIFIERS
    const seenNullifiers: Nullifier[] = []
    const isValid = await memPool.isValidTransaction(transaction, beforeSize, seenNullifiers)
    expect(isValid).toBe(false)
  })

  it('Updates seenNullifiers with valid transactions', async () => {
    const seenNullifiers: Nullifier[] = []
    const beforeSize = TEST_CHAIN_NUM_NULLIFIERS
    let transaction = new TestTransaction(true, ['abc', 'def'], 50, [
      { nullifier: makeNullifier(8), commitment: '0-3', size: 4 },
    ])
    let isValid = await memPool.isValidTransaction(transaction, beforeSize, seenNullifiers)
    expect(isValid).toBe(true)
    expect(seenNullifiers).toHaveLength(1)

    transaction = new TestTransaction(true, ['jkl', 'mno'], 40, [
      { nullifier: makeNullifier(9), commitment: '0-3', size: 4 },
    ])
    isValid = await memPool.isValidTransaction(transaction, beforeSize, seenNullifiers)
    expect(isValid).toBe(true)
    expect(seenNullifiers).toHaveLength(2)
  })
})
