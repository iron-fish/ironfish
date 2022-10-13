/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import { createNodeTest, useBlockWithTx } from '../testUtilities'
import { RecentFeeCache } from './recentFeeCache'

describe('RecentFeeCache', () => {
  const nodeTest = createNodeTest()

  describe('setUp', () => {
    it('should build recent fee cache with capacity of 1', async () => {
      const node = nodeTest.node

      const { block, transaction } = await useBlockWithTx(node, undefined, undefined, true, {
        fee: 10,
      })

      await node.chain.addBlock(block)

      const recentFeeCache = new RecentFeeCache({
        chain: node.chain,
        recentBlocksNum: 1,
        txSampleSize: 1,
      })
      await recentFeeCache.setUp()

      expect(recentFeeCache.getSuggestedFee(60)).toBe(transaction.fee())
    })

    it('should build recent fee cache with more than one transaction', async () => {
      const node = nodeTest.node
      const { account, block, transaction } = await useBlockWithTx(
        node,
        undefined,
        undefined,
        true,
        { fee: 10 },
      )

      await node.chain.addBlock(block)

      const fee = Number(transaction.fee()) - 1
      const { block: block2, transaction: transaction2 } = await useBlockWithTx(
        node,
        account,
        account,
        true,
        { fee },
      )

      await node.chain.addBlock(block2)

      const recentFeeCache = new RecentFeeCache({
        chain: node.chain,
        recentBlocksNum: 1,
        txSampleSize: 1,
      })
      await recentFeeCache.setUp()

      expect(recentFeeCache.size()).toBe(1)
      expect(recentFeeCache.getSuggestedFee(60)).toBe(transaction2.fee())
    })
  })

  describe('addTransaction', () => {
    it('should add transactions to the cache', async () => {
      const node = nodeTest.node
      const { account, block, transaction } = await useBlockWithTx(
        node,
        undefined,
        undefined,
        true,
        { fee: 10 },
      )

      await node.chain.addBlock(block)
      const recentFeeCache = new RecentFeeCache({
        chain: node.chain,
        recentBlocksNum: 1,
        txSampleSize: 2,
      })
      await recentFeeCache.setUp()

      const fee = Number(transaction.fee()) - 1
      const { transaction: transaction2 } = await useBlockWithTx(node, account, account, true, {
        fee,
      })

      recentFeeCache.addTransaction(transaction2)

      expect(recentFeeCache.size()).toBe(2)
      expect(recentFeeCache.getSuggestedFee(40)).toBe(transaction2.fee())
      expect(recentFeeCache.getSuggestedFee(60)).toBe(transaction.fee())
    })

    it('should remove the oldest transaction from the cache when the cache is full', async () => {
      const node = nodeTest.node
      const { account, block } = await useBlockWithTx(node, undefined, undefined, true, {
        fee: 10,
      })

      await node.chain.addBlock(block)

      const { transaction: transaction2 } = await useBlockWithTx(node, account, account)

      const recentFeeCache = new RecentFeeCache({
        chain: node.chain,
        recentBlocksNum: 1,
        txSampleSize: 1,
      })
      await recentFeeCache.setUp()

      recentFeeCache.addTransaction(transaction2)

      expect(recentFeeCache.size()).toBe(1)
      expect(recentFeeCache.getSuggestedFee(60)).toBe(transaction2.fee())
    })
  })

  describe('onConnectBlock', () => {
    it('should add all transactions from a block that are in the mempool', async () => {
      const node = nodeTest.node
      const { block, transaction } = await useBlockWithTx(node, undefined, undefined, true, {
        fee: 10,
      })

      await node.chain.addBlock(block)

      const recentFeeCache = new RecentFeeCache({
        chain: node.chain,
        recentBlocksNum: 1,
        txSampleSize: 1,
      })

      expect(recentFeeCache.size()).toBe(0)

      node.memPool.acceptTransaction(transaction)

      recentFeeCache.onConnectBlock(block, node.memPool)

      expect(recentFeeCache.size()).toBe(1)
      expect(recentFeeCache.getSuggestedFee(60)).toBe(transaction.fee())
    })

    it('should exclude transactions from a block that are not in the mempool', async () => {
      const node = nodeTest.node
      const { block, transaction } = await useBlockWithTx(node, undefined, undefined, true, {
        fee: 10,
      })

      await node.chain.addBlock(block)

      const recentFeeCache = new RecentFeeCache({
        chain: node.chain,
        recentBlocksNum: 1,
        txSampleSize: 1,
      })

      expect(recentFeeCache.size()).toBe(0)

      Assert.isFalse(node.memPool.exists(transaction.hash()))

      recentFeeCache.onConnectBlock(block, node.memPool)

      expect(recentFeeCache.size()).toBe(0)
    })

    it('should remove old transactions from the cache when its maximum size is reached', async () => {
      const node = nodeTest.node

      const recentFeeCache = new RecentFeeCache({
        chain: node.chain,
        recentBlocksNum: 1,
        txSampleSize: 1,
      })

      const { account, block, transaction } = await useBlockWithTx(
        node,
        undefined,
        undefined,
        true,
        { fee: 10 },
      )

      node.memPool.acceptTransaction(transaction)

      recentFeeCache.onConnectBlock(block, node.memPool)

      expect(recentFeeCache.size()).toBe(1)

      const fee = Number(transaction.fee()) - 1
      const { block: block2, transaction: transaction2 } = await useBlockWithTx(
        node,
        account,
        account,
        true,
        {
          fee,
        },
      )

      node.memPool.acceptTransaction(transaction2)

      recentFeeCache.onConnectBlock(block2, node.memPool)

      expect(recentFeeCache.size()).toBe(1)
      expect(recentFeeCache.getSuggestedFee(60)).toBe(transaction2.fee())
    })

    it('should keep old transactions in the cache if its maximum size has not been reached', async () => {
      const node = nodeTest.node

      const recentFeeCache = new RecentFeeCache({
        chain: node.chain,
        recentBlocksNum: 2,
        txSampleSize: 1,
      })

      const { account, block, transaction } = await useBlockWithTx(
        node,
        undefined,
        undefined,
        true,
        { fee: 10 },
      )

      node.memPool.acceptTransaction(transaction)

      recentFeeCache.onConnectBlock(block, node.memPool)

      expect(recentFeeCache.size()).toBe(1)

      const fee = Number(transaction.fee()) - 1
      const { block: block2, transaction: transaction2 } = await useBlockWithTx(
        node,
        account,
        account,
        true,
        {
          fee,
        },
      )

      node.memPool.acceptTransaction(transaction2)

      recentFeeCache.onConnectBlock(block2, node.memPool)

      expect(recentFeeCache.size()).toBe(2)
    })
  })
})
