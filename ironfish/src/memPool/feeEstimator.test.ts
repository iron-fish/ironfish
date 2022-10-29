/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import {
  createNodeTest,
  useAccountFixture,
  useBlockWithTx,
  useBlockWithTxs,
} from '../testUtilities'
import { FeeEstimator, FeeRateEntry, getFeeRate, PRIORITY_LEVELS } from './feeEstimator'

describe('FeeEstimator', () => {
  const nodeTest = createNodeTest()

  describe('init', () => {
    it('should build recent fee cache with capacity of 1', async () => {
      const node = nodeTest.node

      const { block, transaction } = await useBlockWithTx(node, undefined, undefined, true, {
        fee: 10,
      })

      await node.chain.addBlock(block)

      const feeEstimator = new FeeEstimator({
        wallet: node.wallet,
        maxBlockHistory: 1,
      })
      await feeEstimator.init(node.chain)

      expect(feeEstimator.estimateFeeRate(PRIORITY_LEVELS[0])).toBe(getFeeRate(transaction))
      expect(feeEstimator.estimateFeeRate(PRIORITY_LEVELS[1])).toBe(getFeeRate(transaction))
      expect(feeEstimator.estimateFeeRate(PRIORITY_LEVELS[2])).toBe(getFeeRate(transaction))
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

      const feeEstimator = new FeeEstimator({
        wallet: node.wallet,
        maxBlockHistory: 1,
      })

      await feeEstimator.init(node.chain)

      expect(feeEstimator.size(PRIORITY_LEVELS[0])).toBe(1)
      expect(feeEstimator.size(PRIORITY_LEVELS[1])).toBe(1)
      expect(feeEstimator.size(PRIORITY_LEVELS[2])).toBe(1)

      expect(feeEstimator.estimateFeeRate(PRIORITY_LEVELS[0])).toBe(getFeeRate(transaction2))
      expect(feeEstimator.estimateFeeRate(PRIORITY_LEVELS[1])).toBe(getFeeRate(transaction2))
      expect(feeEstimator.estimateFeeRate(PRIORITY_LEVELS[2])).toBe(getFeeRate(transaction2))
    })

    it('should initialize with the most recent block at the end of the queue', async () => {
      const node = nodeTest.node
      const { account, block, transaction } = await useBlockWithTx(
        node,
        undefined,
        undefined,
        true,
        {
          fee: 10,
        },
      )

      await node.chain.addBlock(block)
      await node.wallet.updateHead()

      const { block: block2, transaction: transaction2 } = await useBlockWithTx(
        node,
        account,
        account,
        false,
        {
          fee: 20,
        },
      )

      await node.chain.addBlock(block2)
      await node.wallet.updateHead()

      const feeEstimator = new FeeEstimator({
        wallet: node.wallet,
        maxBlockHistory: 2,
      })
      await feeEstimator.init(node.chain)

      expect(feeEstimator.size(PRIORITY_LEVELS[0])).toBe(2)
      expect(feeEstimator.size(PRIORITY_LEVELS[1])).toBe(2)
      expect(feeEstimator.size(PRIORITY_LEVELS[2])).toBe(2)
      let queue: FeeRateEntry[] | undefined
      Assert.isNotUndefined((queue = feeEstimator['queues']['low']))
      expect(queue[0].feeRate).toEqual(getFeeRate(transaction))
      expect(queue[1].feeRate).toEqual(getFeeRate(transaction2))
    })
  })

  describe('onConnectBlock', () => {
    it('should add all transactions from a block that are in the mempool', async () => {
      const node = nodeTest.node
      const { block, transaction } = await useBlockWithTx(node, undefined, undefined, true, {
        fee: 10,
      })

      await node.chain.addBlock(block)

      const feeEstimator = new FeeEstimator({
        wallet: node.wallet,
        maxBlockHistory: 1,
      })

      expect(feeEstimator.size(PRIORITY_LEVELS[0])).toBe(0)
      expect(feeEstimator.size(PRIORITY_LEVELS[1])).toBe(0)
      expect(feeEstimator.size(PRIORITY_LEVELS[2])).toBe(0)

      node.memPool.acceptTransaction(transaction)

      feeEstimator.onConnectBlock(block, node.memPool)

      expect(feeEstimator.size(PRIORITY_LEVELS[0])).toBe(1)
      expect(feeEstimator.size(PRIORITY_LEVELS[1])).toBe(1)
      expect(feeEstimator.size(PRIORITY_LEVELS[2])).toBe(1)

      expect(feeEstimator.estimateFeeRate(PRIORITY_LEVELS[0])).toBe(getFeeRate(transaction))
      expect(feeEstimator.estimateFeeRate(PRIORITY_LEVELS[1])).toBe(getFeeRate(transaction))
      expect(feeEstimator.estimateFeeRate(PRIORITY_LEVELS[2])).toBe(getFeeRate(transaction))
    })

    it('should exclude transactions from a block that are not in the mempool', async () => {
      const node = nodeTest.node
      const { block, transaction } = await useBlockWithTx(node, undefined, undefined, true, {
        fee: 10,
      })

      await node.chain.addBlock(block)

      const feeEstimator = new FeeEstimator({
        wallet: node.wallet,
        maxBlockHistory: 1,
      })

      expect(feeEstimator.size(PRIORITY_LEVELS[0])).toBe(0)
      expect(feeEstimator.size(PRIORITY_LEVELS[1])).toBe(0)
      expect(feeEstimator.size(PRIORITY_LEVELS[2])).toBe(0)

      Assert.isFalse(node.memPool.exists(transaction.hash()))

      feeEstimator.onConnectBlock(block, node.memPool)

      expect(feeEstimator.size(PRIORITY_LEVELS[0])).toBe(0)
      expect(feeEstimator.size(PRIORITY_LEVELS[1])).toBe(0)
      expect(feeEstimator.size(PRIORITY_LEVELS[2])).toBe(0)
    })

    it('should remove old transactions from the cache when its maximum size is reached', async () => {
      const node = nodeTest.node

      const feeEstimator = new FeeEstimator({
        wallet: node.wallet,
        maxBlockHistory: 1,
      })

      const { account, block, transaction } = await useBlockWithTx(
        node,
        undefined,
        undefined,
        true,
        { fee: 10 },
      )

      node.memPool.acceptTransaction(transaction)

      feeEstimator.onConnectBlock(block, node.memPool)

      expect(feeEstimator.size(PRIORITY_LEVELS[0])).toBe(1)
      expect(feeEstimator.size(PRIORITY_LEVELS[1])).toBe(1)
      expect(feeEstimator.size(PRIORITY_LEVELS[2])).toBe(1)

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

      feeEstimator.onConnectBlock(block2, node.memPool)

      expect(feeEstimator.size(PRIORITY_LEVELS[0])).toBe(1)
      expect(feeEstimator.size(PRIORITY_LEVELS[1])).toBe(1)
      expect(feeEstimator.size(PRIORITY_LEVELS[2])).toBe(1)

      expect(feeEstimator.estimateFeeRate(PRIORITY_LEVELS[0])).toBe(getFeeRate(transaction2))
      expect(feeEstimator.estimateFeeRate(PRIORITY_LEVELS[1])).toBe(getFeeRate(transaction2))
      expect(feeEstimator.estimateFeeRate(PRIORITY_LEVELS[2])).toBe(getFeeRate(transaction2))
    })

    it('should keep old transactions in the cache if its maximum size has not been reached', async () => {
      const node = nodeTest.node

      const feeEstimator = new FeeEstimator({
        wallet: node.wallet,
        maxBlockHistory: 2,
      })

      const { account, block, transaction } = await useBlockWithTx(
        node,
        undefined,
        undefined,
        true,
        { fee: 10 },
      )

      node.memPool.acceptTransaction(transaction)

      feeEstimator.onConnectBlock(block, node.memPool)

      expect(feeEstimator.size(PRIORITY_LEVELS[0])).toBe(1)
      expect(feeEstimator.size(PRIORITY_LEVELS[1])).toBe(1)
      expect(feeEstimator.size(PRIORITY_LEVELS[2])).toBe(1)

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

      feeEstimator.onConnectBlock(block2, node.memPool)

      expect(feeEstimator.size(PRIORITY_LEVELS[0])).toBe(2)
      expect(feeEstimator.size(PRIORITY_LEVELS[1])).toBe(2)
      expect(feeEstimator.size(PRIORITY_LEVELS[2])).toBe(2)
    })

    it('should add only add a limited number of transactions from each block', async () => {
      const node = nodeTest.node

      const feeEstimator = new FeeEstimator({
        wallet: node.wallet,
        maxBlockHistory: 2,
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

      feeEstimator.onConnectBlock(block, node.memPool)

      expect(feeEstimator.size(PRIORITY_LEVELS[0])).toBe(1)
      expect(feeEstimator.size(PRIORITY_LEVELS[1])).toBe(1)
      expect(feeEstimator.size(PRIORITY_LEVELS[2])).toBe(1)

      const { block: newBlock, transactions: newTransactions } = await useBlockWithTxs(
        node,
        3,
        account,
      )
      for (const newTransaction of newTransactions) {
        node.memPool.acceptTransaction(newTransaction)
      }

      feeEstimator.onConnectBlock(newBlock, node.memPool)

      expect(feeEstimator.size(PRIORITY_LEVELS[0])).toBe(2)
      expect(feeEstimator.size(PRIORITY_LEVELS[1])).toBe(2)
      expect(feeEstimator.size(PRIORITY_LEVELS[2])).toBe(2)

      // transaction from first block is still in the cache
      expect(feeEstimator['queues']['low'].at(0)?.blockHash).toEqualHash(block.header.hash)
    })
  })

  describe('onDisconnectBlock', () => {
    it('should remove all transactions from a block from the end of the queue', async () => {
      const node = nodeTest.node

      const feeEstimator = new FeeEstimator({
        wallet: node.wallet,
        maxBlockHistory: 2,
      })

      const { block, transaction } = await useBlockWithTx(node, undefined, undefined, true)

      node.memPool.acceptTransaction(transaction)

      feeEstimator.onConnectBlock(block, node.memPool)

      expect(feeEstimator.size(PRIORITY_LEVELS[0])).toBe(1)
      expect(feeEstimator.size(PRIORITY_LEVELS[1])).toBe(1)
      expect(feeEstimator.size(PRIORITY_LEVELS[2])).toBe(1)

      feeEstimator.onDisconnectBlock(block)

      expect(feeEstimator.size(PRIORITY_LEVELS[0])).toBe(0)
      expect(feeEstimator.size(PRIORITY_LEVELS[1])).toBe(0)
      expect(feeEstimator.size(PRIORITY_LEVELS[2])).toBe(0)
    })

    it('should not remove transactions from the queue that did not come from the disconnected block', async () => {
      const node = nodeTest.node

      const feeEstimator = new FeeEstimator({
        wallet: node.wallet,
        maxBlockHistory: 2,
      })

      const { account, block, transaction } = await useBlockWithTx(
        node,
        undefined,
        undefined,
        true,
        { fee: 10 },
      )

      node.memPool.acceptTransaction(transaction)

      feeEstimator.onConnectBlock(block, node.memPool)

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

      feeEstimator.onConnectBlock(block2, node.memPool)

      expect(feeEstimator.size(PRIORITY_LEVELS[0])).toBe(2)
      expect(feeEstimator.size(PRIORITY_LEVELS[1])).toBe(2)
      expect(feeEstimator.size(PRIORITY_LEVELS[2])).toBe(2)

      feeEstimator.onDisconnectBlock(block2)

      expect(feeEstimator.size(PRIORITY_LEVELS[0])).toBe(1)
      expect(feeEstimator.size(PRIORITY_LEVELS[1])).toBe(1)
      expect(feeEstimator.size(PRIORITY_LEVELS[2])).toBe(1)
    })
  })

  describe('estimateFee', () => {
    it('should estimate fee for a pending transaction', async () => {
      const node = nodeTest.node
      const { account, block } = await useBlockWithTx(node, undefined, undefined, true, {
        fee: 10,
      })

      const receiver = await useAccountFixture(node.wallet, 'accountA')

      await node.chain.addBlock(block)
      await node.wallet.updateHead()

      const feeEstimator = new FeeEstimator({
        wallet: node.wallet,
        maxBlockHistory: 1,
      })
      await feeEstimator.init(node.chain)

      const fee = await feeEstimator.estimateFee('low', account, [
        {
          publicAddress: receiver.publicAddress,
          amount: BigInt(5),
          memo: 'test',
        },
      ])

      expect(fee).toBe(BigInt(6))
    })
  })
})
