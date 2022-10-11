/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import { IronfishNode } from '../node'
import { Block } from '../primitives'
import { createNodeTest, useAccountFixture, useBlockWithTx } from '../testUtilities'
import { RecentFeeCache } from './recentFeeCache'
import { Wallet } from './wallet'

describe('RecentFeeCache', () => {
  const nodeTest = createNodeTest()
  let node: IronfishNode
  let block: Block | null
  let wallet: Wallet

  beforeEach(async () => {
    node = nodeTest.node
    wallet = node.wallet
    const accountA = await useAccountFixture(wallet, 'accountA')
    const accountB = await useAccountFixture(wallet, 'accountB')
    await useBlockWithTx(node, accountA, accountB)
  })

  it('setUpCache build recent fee cache with capacity of 1', async () => {
    const recentFeeCache = new RecentFeeCache(node.chain, 1, 1)
    await recentFeeCache.setUpCache()

    block = await node.chain.getBlock(node.chain.latest.hash)
    Assert.isNotNull(block)

    expect(recentFeeCache.getSuggestedFee(60)).toBe(block.transactions[0].fee())
  })

  it('setUpCache build recent fee cache with more than one transaction', async () => {
    const accountC = await useAccountFixture(wallet, 'accountC')
    const accountD = await useAccountFixture(wallet, 'accountD')
    await useBlockWithTx(node, accountC, accountD)

    const recentFeeCache = new RecentFeeCache(node.chain, 1, 1)
    await recentFeeCache.setUpCache()

    block = await node.chain.getBlock(node.chain.latest.hash)
    Assert.isNotNull(block)

    expect(recentFeeCache.getCacheSize()).toBe(1)
    let lowestFee = block.transactions[0].fee()
    block.transactions.forEach((tx) => {
      if (tx.fee() < lowestFee) {
        lowestFee = tx.fee()
      }
    })
    expect(recentFeeCache.getSuggestedFee(60)).toBe(lowestFee)
  })

  it.only('add transaction to cache', async () => {
    const accountC = await useAccountFixture(wallet, 'accountC')
    const accountD = await useAccountFixture(wallet, 'accountD')
    const { transaction: transaction2 } = await useBlockWithTx(node, accountC, accountD)

    const recentFeeCache = new RecentFeeCache(node.chain, 1, 2)
    await recentFeeCache.setUpCache()

    block = await node.chain.getBlock(node.chain.latest.hash)
    Assert.isNotNull(block)

    recentFeeCache.addFee(transaction2)

    let lowestFee = block.transactions[0].fee()
    let highestFee = block.transactions[0].fee()
    block.transactions.forEach((tx) => {
      if (tx.fee() < lowestFee) {
        lowestFee = tx.fee()
      }
      if (tx.fee() > highestFee) {
        highestFee = tx.fee()
      }
    })

    if (transaction2.fee() < lowestFee) {
      lowestFee = transaction2.fee()
    }

    if (transaction2.fee() > highestFee) {
      highestFee = transaction2.fee()
    }

    expect(recentFeeCache.getCacheSize()).toBe(2)
    expect(recentFeeCache.getSuggestedFee(40)).toBe(lowestFee)
    expect(recentFeeCache.getSuggestedFee(60)).toBe(highestFee)
  })

  it.only('add transaction to cache when cache is full', async () => {
    const accountC = await useAccountFixture(wallet, 'accountC')
    const accountD = await useAccountFixture(wallet, 'accountD')
    const { transaction: transaction2, block: block2 } = await useBlockWithTx(
      node,
      accountC,
      accountD,
    )

    const recentFeeCache = new RecentFeeCache(node.chain, 1, 1)
    await recentFeeCache.setUpCache()

    recentFeeCache.addFee(transaction2)

    expect(recentFeeCache.getCacheSize()).toBe(1)
    expect(recentFeeCache.getSuggestedFee(60)).toBe(transaction2.fee())
  })
})
