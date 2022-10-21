/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import { createNodeTest, useBlockWithTx, useBlockWithTxs } from '../testUtilities'
import { getFeeRate, RecentFeeCache } from './recentFeeCache'

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

      expect(recentFeeCache.estimateFeeRate(60)).toBe(getFeeRate(transaction))
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
      expect(recentFeeCache.estimateFeeRate(60)).toBe(getFeeRate(transaction2))
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
      expect(recentFeeCache.estimateFeeRate(60)).toBe(getFeeRate(transaction))
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
      expect(recentFeeCache.estimateFeeRate(60)).toBe(getFeeRate(transaction2))
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

    it('should add only add a limited number of transactions from each block', async () => {
      const node = nodeTest.node

      const recentFeeCache = new RecentFeeCache({
        chain: node.chain,
        recentBlocksNum: 2,
        txSampleSize: 2,
      })

      const { account, block, transaction } = await useBlockWithTx(
        node,
        undefined,
        undefined,
        true,
        {
          fee: 10,
        },
      )

      node.memPool.acceptTransaction(transaction)

      recentFeeCache.onConnectBlock(block, node.memPool)

      expect(recentFeeCache.size()).toBe(1)

      const { block: newBlock, transactions: newTransactions } = await useBlockWithTxs(
        node,
        3,
        account,
      )
      for (const newTransaction of newTransactions) {
        node.memPool.acceptTransaction(newTransaction)
      }

      recentFeeCache.onConnectBlock(newBlock, node.memPool)

      expect(recentFeeCache.size()).toBe(3)

      // transaction from first block is still in the cache
      expect(recentFeeCache['queue'][0].blockHash).toEqualHash(block.header.hash)
    })
  })

  describe('onDisconnectBlock', () => {
    it('should remove all transactions from a block from the end of the queue', async () => {
      const node = nodeTest.node

      const recentFeeCache = new RecentFeeCache({
        chain: node.chain,
        recentBlocksNum: 2,
        txSampleSize: 2,
      })

      const { block, transaction } = await useBlockWithTx(node, undefined, undefined, true)

      node.memPool.acceptTransaction(transaction)

      recentFeeCache.onConnectBlock(block, node.memPool)

      expect(recentFeeCache.size()).toBe(1)

      recentFeeCache.onDisconnectBlock(block)

      expect(recentFeeCache.size()).toBe(0)
    })

    it('should not remove transactions from the queue that did not come from the disconnected block', async () => {
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

      recentFeeCache.onDisconnectBlock(block2)

      expect(recentFeeCache.size()).toBe(1)
    })
  })
})
