/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../../assert'
import {
  createNodeTest,
  useAccountFixture,
  useBlockWithTx,
  useMinerBlockFixture,
} from '../../testUtilities'
import { NullifierSet } from './nullifierSet'

describe('NullifierSet', () => {
  const nodeTest = createNodeTest()

  it('connects blocks and checks that nullifiers are included', async () => {
    const { node, chain } = nodeTest

    const set = new NullifierSet({ db: chain.blockchainDb.db, name: 'u-test' })

    await chain.open()

    const accountA = await useAccountFixture(node.wallet, 'accountA')

    const block1 = await chain.getBlock(chain.genesis)

    const block2 = await useMinerBlockFixture(node.chain, 2, accountA)
    await expect(node.chain).toAddBlock(block2)

    await node.wallet.scan()

    const { block: block3 } = await useBlockWithTx(node, accountA, accountA, false)
    await expect(node.chain).toAddBlock(block3)

    await node.wallet.scan()

    const { block: block4 } = await useBlockWithTx(node, accountA, accountA, false)
    await expect(node.chain).toAddBlock(block4)

    await node.wallet.scan()

    Assert.isNotNull(block1)
    const block1Nullifiers = block1.transactions
      .flatMap((t) => t.spends)
      .map((s) => s.nullifier)

    const block2Nullifiers = block2.transactions
      .flatMap((t) => t.spends)
      .map((s) => s.nullifier)

    const block3Nullifiers = block3.transactions
      .flatMap((t) => t.spends)
      .map((s) => s.nullifier)

    const block4Nullifiers = block4.transactions
      .flatMap((t) => t.spends)
      .map((s) => s.nullifier)

    const allNullifiers = [
      ...block1Nullifiers,
      ...block2Nullifiers,
      ...block3Nullifiers,
      ...block4Nullifiers,
    ]

    expect(await set.size()).toBe(0)
    await set.connectBlock(block1)
    expect(await set.size()).toBe(block1Nullifiers.length)
    await set.connectBlock(block2)
    expect(await set.size()).toBe(block1Nullifiers.length + block2Nullifiers.length)
    await set.connectBlock(block3)
    expect(await set.size()).toBe(allNullifiers.length - block4Nullifiers.length)
    await set.connectBlock(block4)
    expect(await set.size()).toBe(allNullifiers.length)

    for (const nullifier of allNullifiers) {
      expect(await set.contains(nullifier)).toBe(true)
    }

    await expect(set.connectBlock(block3)).rejects.toThrow()
    await expect(set.connectBlock(block4)).rejects.toThrow()

    await set.disconnectBlock(block4)

    expect(await set.size()).toBe(allNullifiers.length - block4Nullifiers.length)

    for (const nullifier of [...block1Nullifiers, ...block2Nullifiers, ...block3Nullifiers]) {
      expect(await set.contains(nullifier)).toBe(true)
    }

    for (const nullifier of block4Nullifiers) {
      expect(await set.contains(nullifier)).toBe(false)
    }
  })
})
