/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import * as ConsensusUtils from '../consensus/utils'
import { getTransactionSize } from '../network/utils/serializers'
import { Transaction } from '../primitives'
import { createNodeTest, useAccountFixture, useBlockWithTx } from '../testUtilities'
import { getFeeRate } from './feeEstimator'

describe('MemPool', () => {
  describe('size', () => {
    const nodeTest = createNodeTest()

    it('returns the number of transactions in the node', async () => {
      const { node } = nodeTest
      const { wallet, memPool } = node
      const accountA = await useAccountFixture(wallet, 'accountA')
      const accountB = await useAccountFixture(wallet, 'accountB')
      const { transaction } = await useBlockWithTx(node, accountA, accountB)

      memPool.acceptTransaction(transaction)

      expect(memPool.count()).toBe(1)
    })
  })

  describe('sizeBytes', () => {
    const nodeTest = createNodeTest()

    it('returns the size of memory usage for transactions and nullifiers', async () => {
      const { node } = nodeTest
      const { wallet, memPool } = node
      const accountA = await useAccountFixture(wallet, 'accountA')
      const accountB = await useAccountFixture(wallet, 'accountB')
      const accountC = await useAccountFixture(wallet, 'accountC')
      const accountD = await useAccountFixture(wallet, 'accountD')
      const { transaction, block } = await useBlockWithTx(node, accountA, accountB)
      const { transaction: transaction2 } = await useBlockWithTx(node, accountC, accountD)

      memPool.acceptTransaction(transaction)

      const size = (tx: Transaction) => {
        return getTransactionSize(tx)
      }

      expect(memPool.sizeBytes()).toBe(size(transaction))

      // If we accept the same transaction it should not add to the memory size
      memPool.acceptTransaction(transaction)

      expect(memPool.sizeBytes()).toBe(size(transaction))

      // If we add another it should include that in size
      memPool.acceptTransaction(transaction2)

      expect(memPool.sizeBytes()).toBe(size(transaction) + size(transaction2))

      // If we remove the first transaction it should reflect that
      memPool.onConnectBlock(block)

      expect(memPool.sizeBytes()).toBe(size(transaction2))

      // If we remove the first transaction a second time it should not reduce the size again
      memPool.onConnectBlock(block)

      expect(memPool.sizeBytes()).toBe(size(transaction2))
    })
  })

  describe('exists', () => {
    describe('with a missing hash', () => {
      const nodeTest = createNodeTest()

      it('returns false', async () => {
        const { node } = nodeTest
        const { wallet, memPool } = node
        const accountA = await useAccountFixture(wallet, 'accountA')
        const accountB = await useAccountFixture(wallet, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)

        expect(memPool.exists(transaction.hash())).toBe(false)
      })
    })

    describe('with a valid hash', () => {
      const nodeTest = createNodeTest()

      it('returns true', async () => {
        const { node } = nodeTest
        const { wallet, memPool } = node
        const accountA = await useAccountFixture(wallet, 'accountA')
        const accountB = await useAccountFixture(wallet, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)

        expect(memPool.exists(transaction.hash())).toBe(false)
      })
    })
  })

  describe('orderedTransactions', () => {
    const nodeTest = createNodeTest()

    it('returns transactions from the node mempool sorted by fee rate', async () => {
      const { node } = nodeTest
      const { wallet, memPool } = node
      const accountA = await useAccountFixture(wallet, 'accountA')
      const accountB = await useAccountFixture(wallet, 'accountB')
      const accountC = await useAccountFixture(wallet, 'accountC')
      const { block, transaction: transactionA } = await useBlockWithTx(
        node,
        accountA,
        accountB,
      )
      const transactionB = block.minersFee
      const { transaction: transactionC } = await useBlockWithTx(node, accountC, accountA)

      jest.spyOn(transactionA, 'fee').mockImplementation(() => BigInt(4))
      jest.spyOn(transactionB, 'fee').mockImplementation(() => BigInt(4))
      jest.spyOn(transactionC, 'fee').mockImplementation(() => BigInt(1))

      // Miner's fee transaction has a smaller size than the normal transaction fixture
      expect(getFeeRate(transactionB)).toBeGreaterThan(getFeeRate(transactionA))
      expect(getFeeRate(transactionA)).toBeGreaterThan(getFeeRate(transactionC))

      memPool.acceptTransaction(transactionA)
      memPool.acceptTransaction(transactionB)
      memPool.acceptTransaction(transactionC)

      const transactions = Array.from(memPool.orderedTransactions())
      expect(transactions).toEqual([transactionB, transactionA, transactionC])
    })

    it('does not return transactions that have been removed from the mempool', async () => {
      const { node } = nodeTest
      const { wallet, memPool } = node
      const accountA = await useAccountFixture(wallet, 'accountA')
      const accountB = await useAccountFixture(wallet, 'accountB')
      const { transaction: transactionA } = await useBlockWithTx(node, accountA, accountB)
      const { transaction: transactionB } = await useBlockWithTx(node, accountA, accountB)

      jest.spyOn(transactionA, 'fee').mockImplementationOnce(() => BigInt(1))
      jest.spyOn(transactionB, 'fee').mockImplementationOnce(() => BigInt(4))

      memPool.acceptTransaction(transactionA)
      memPool.acceptTransaction(transactionB)

      const generator = memPool.orderedTransactions()
      const result = generator.next()
      expect(result.done).toBe(false)

      memPool['deleteTransaction'](transactionA)
      memPool['deleteTransaction'](transactionB)

      const transactions = Array.from(generator)
      expect(transactions).toEqual([])
    })
  })

  describe('acceptTransaction', () => {
    describe('with an existing hash in the mempool', () => {
      const nodeTest = createNodeTest()

      it('returns false', async () => {
        const { node } = nodeTest
        const { wallet, memPool } = node
        const accountA = await useAccountFixture(wallet, 'accountA')
        const accountB = await useAccountFixture(wallet, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)

        memPool.acceptTransaction(transaction)

        expect(memPool.acceptTransaction(transaction)).toBe(false)
      })
    })

    describe('with an expired sequence', () => {
      const nodeTest = createNodeTest()

      afterEach(() => jest.restoreAllMocks())

      it('returns false', async () => {
        const { node } = nodeTest
        const { wallet, memPool } = node
        const accountA = await useAccountFixture(wallet, 'accountA')
        const accountB = await useAccountFixture(wallet, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)

        const isExpiredSequenceSpy = jest
          .spyOn(ConsensusUtils, 'isExpiredSequence')
          .mockReturnValue(true)

        expect(memPool.acceptTransaction(transaction)).toBe(false)
        expect(isExpiredSequenceSpy).toHaveBeenCalledTimes(1)
        expect(isExpiredSequenceSpy).toHaveLastReturnedWith(true)
      })
    })

    describe('with an existing nullifier in a transaction in the mempool', () => {
      const nodeTest = createNodeTest()

      it('returns false', async () => {
        const { node } = nodeTest
        const { wallet, memPool } = node
        const accountA = await useAccountFixture(wallet, 'accountA')
        const accountB = await useAccountFixture(wallet, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)
        const { transaction: transaction2 } = await useBlockWithTx(
          node,
          accountA,
          accountB,
          false,
        )

        expect(transaction.getSpend(0).nullifier).toEqual(transaction2.getSpend(0).nullifier)

        memPool.acceptTransaction(transaction)

        expect(memPool.acceptTransaction(transaction2)).toBe(false)
      })

      it('returns true with a higher fee', async () => {
        const { node } = nodeTest
        const { wallet, memPool } = node
        const accountA = await useAccountFixture(wallet, 'accountA')
        const accountB = await useAccountFixture(wallet, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)
        const { transaction: transaction2 } = await useBlockWithTx(
          node,
          accountA,
          accountB,
          false,
          { fee: 2 },
        )

        expect(transaction.getSpend(0).nullifier).toEqual(transaction2.getSpend(0).nullifier)

        memPool.acceptTransaction(transaction)

        expect(memPool.acceptTransaction(transaction2)).toBe(true)
      })
    })

    describe('with a new hash', () => {
      const nodeTest = createNodeTest()

      it('returns true', async () => {
        const { node } = nodeTest
        const { wallet, memPool } = node
        const accountA = await useAccountFixture(wallet, 'accountA')
        const accountB = await useAccountFixture(wallet, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)

        expect(memPool.acceptTransaction(transaction)).toBe(true)
      })

      it('sets the transaction hash in the mempool map and priority queue', async () => {
        const { node } = nodeTest
        const { wallet, memPool } = node
        const accountA = await useAccountFixture(wallet, 'accountA')
        const accountB = await useAccountFixture(wallet, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)

        memPool.acceptTransaction(transaction)

        expect(memPool.exists(transaction.hash())).toBe(true)
        expect([...memPool.orderedTransactions()]).toContainEqual(transaction)
      })
    })
  })

  describe('when a block is connected with a transaction in the mempool', () => {
    const nodeTest = createNodeTest()

    it('removes the block transactions and expired transactions from the mempool', async () => {
      const { node, chain } = nodeTest
      const { wallet, memPool } = node

      const accountA = await useAccountFixture(wallet, 'accountA')
      const accountB = await useAccountFixture(wallet, 'accountB')
      const { transaction: transactionA } = await useBlockWithTx(
        node,
        accountA,
        accountB,
        true,
        { expiration: 4 },
      )

      expect(chain.head.sequence).toEqual(2)

      const { block, transaction: transactionB } = await useBlockWithTx(
        node,
        accountB,
        accountA,
      )

      expect(chain.head.sequence).toEqual(3)

      memPool.acceptTransaction(transactionA)
      memPool.acceptTransaction(transactionB)
      expect(memPool.exists(transactionA.hash())).toBe(true)
      expect(memPool.exists(transactionB.hash())).toBe(true)

      await chain.addBlock(block)

      expect(chain.head.sequence).toEqual(4)

      expect(memPool.exists(transactionA.hash())).toBe(false)
      expect(memPool.exists(transactionB.hash())).toBe(false)
      expect([...memPool.orderedTransactions()]).not.toContainEqual(transactionA)
      expect([...memPool.orderedTransactions()]).not.toContainEqual(transactionB)
    })
  })

  describe('when a block is disconnected', () => {
    const nodeTest = createNodeTest()

    it('adds the block transactions to the mempool', async () => {
      const { node, chain } = nodeTest
      const { wallet, memPool } = node
      const accountA = await useAccountFixture(wallet, 'accountA')
      const accountB = await useAccountFixture(wallet, 'accountB')
      const { block, transaction } = await useBlockWithTx(node, accountA, accountB)
      const minersFee = block.transactions[0]

      Assert.isNotUndefined(minersFee)
      Assert.isNotUndefined(transaction)

      await chain.addBlock(block)

      await chain.removeBlock(block.header.hash)

      expect(memPool.exists(transaction.hash())).toBe(true)
      expect([...memPool.orderedTransactions()]).toContainEqual(transaction)

      expect(memPool.exists(minersFee.hash())).toBe(false)
      expect([...memPool.orderedTransactions()]).not.toContainEqual(minersFee)
    })
  })
})
