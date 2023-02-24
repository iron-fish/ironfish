/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import * as ConsensusUtils from '../consensus/utils'
import { getTransactionSize } from '../network/utils/serializers'
import { Transaction } from '../primitives'
import {
  createNodeTest,
  useAccountFixture,
  useBlockWithTx,
  useMinerBlockFixture,
  useTxFixture,
} from '../testUtilities'
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
      const { transaction, block } = await useBlockWithTx(
        node,
        accountA,
        accountB,
        undefined,
        undefined,
        false,
      )
      await node.wallet.addPendingTransaction(transaction)
      const { transaction: transaction2 } = await useBlockWithTx(
        node,
        accountC,
        accountD,
        undefined,
        undefined,
        false,
      )

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
        const { transaction } = await useBlockWithTx(
          node,
          accountA,
          accountB,
          true,
          undefined,
          false,
        )

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
        const { transaction } = await useBlockWithTx(
          node,
          accountA,
          accountB,
          true,
          undefined,
          false,
        )

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
      const { transaction: transactionA } = await useBlockWithTx(
        node,
        accountA,
        accountB,
        true,
        { fee: 10 },
      )
      const { transaction: transactionB } = await useBlockWithTx(
        node,
        accountA,
        accountB,
        true,
        { fee: 5 },
      )

      const { transaction: transactionC } = await useBlockWithTx(
        node,
        accountA,
        accountB,
        true,
        { fee: 1 },
      )

      expect(getFeeRate(transactionA)).toBeGreaterThan(getFeeRate(transactionB))
      expect(getFeeRate(transactionB)).toBeGreaterThan(getFeeRate(transactionC))

      memPool.acceptTransaction(transactionB)
      memPool.acceptTransaction(transactionA)
      memPool.acceptTransaction(transactionC)

      const transactions = Array.from(memPool.orderedTransactions())
      expect(transactions).toEqual([transactionA, transactionB, transactionC])
    })

    it('does not return transactions that have been removed from the mempool', async () => {
      const { node } = nodeTest
      const { wallet, memPool } = node
      const accountA = await useAccountFixture(wallet, 'accountA')
      const accountB = await useAccountFixture(wallet, 'accountB')
      const { transaction: transactionA } = await useBlockWithTx(
        node,
        accountA,
        accountB,
        true,
        { fee: 1 },
        false,
      )
      const { transaction: transactionB } = await useBlockWithTx(
        node,
        accountA,
        accountB,
        true,
        { fee: 4 },
        false,
      )

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
        const { transaction } = await useBlockWithTx(
          node,
          accountA,
          accountB,
          true,
          undefined,
          false,
        )

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
        const { transaction } = await useBlockWithTx(
          node,
          accountA,
          accountB,
          true,
          undefined,
          false,
        )

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
        const { transaction } = await useBlockWithTx(
          node,
          accountA,
          accountB,
          true,
          undefined,
          false,
        )
        const { transaction: transaction2 } = await useBlockWithTx(
          node,
          accountA,
          accountB,
          false,
          undefined,
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
        const { transaction } = await useBlockWithTx(
          node,
          accountA,
          accountB,
          true,
          { fee: 1 },
          false,
        )
        const { transaction: transaction2 } = await useBlockWithTx(
          node,
          accountA,
          accountB,
          false,
          { fee: 5 },
          false,
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
        const { transaction } = await useBlockWithTx(
          node,
          accountA,
          accountB,
          true,
          undefined,
          false,
        )

        expect(memPool.acceptTransaction(transaction)).toBe(true)
      })

      it('sets the transaction hash in the mempool map and priority queue', async () => {
        const { node } = nodeTest
        const { wallet, memPool } = node
        const accountA = await useAccountFixture(wallet, 'accountA')
        const accountB = await useAccountFixture(wallet, 'accountB')
        const { transaction } = await useBlockWithTx(
          node,
          accountA,
          accountB,
          true,
          undefined,
          false,
        )

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
        false,
      )

      expect(chain.head.sequence).toEqual(2)

      const { block, transaction: transactionB } = await useBlockWithTx(
        node,
        accountB,
        accountA,
        true,
        undefined,
        false,
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

    it('removes expired transactions from the mempool even if there are 0 expiration transactions', async () => {
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
        false,
      )
      await wallet.addPendingTransaction(transactionA)

      expect(chain.head.sequence).toEqual(2)

      const { transaction: transactionB } = await useBlockWithTx(
        node,
        accountA,
        accountB,
        true,
        { expiration: 0 },
        false,
      )

      expect(chain.head.sequence).toEqual(3)

      memPool.acceptTransaction(transactionA)
      memPool.acceptTransaction(transactionB)
      expect(memPool.exists(transactionA.hash())).toBe(true)
      expect(memPool.exists(transactionB.hash())).toBe(true)

      const block4 = await useMinerBlockFixture(chain)
      await expect(chain).toAddBlock(block4)

      expect(chain.head.sequence).toEqual(4)

      expect(memPool.exists(transactionA.hash())).toBe(false)
      expect(memPool.exists(transactionB.hash())).toBe(true)
      expect([...memPool.orderedTransactions()]).not.toContainEqual(transactionA)
      expect([...memPool.orderedTransactions()]).toContainEqual(transactionB)
    })
  })

  describe('when a block is disconnected', () => {
    const nodeTest = createNodeTest()

    it('adds the block transactions to the mempool', async () => {
      const { node, chain } = nodeTest
      const { wallet, memPool } = node
      const accountA = await useAccountFixture(wallet, 'accountA')
      const accountB = await useAccountFixture(wallet, 'accountB')
      const { block, transaction } = await useBlockWithTx(
        node,
        accountA,
        accountB,
        true,
        undefined,
        false,
      )
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

    it('does not add back in transactions with overlapping nullifiers if fee is smaller', async () => {
      const { node, chain } = nodeTest
      const { wallet, memPool } = node
      const accountA = await useAccountFixture(wallet, 'accountA')
      const accountB = await useAccountFixture(wallet, 'accountB')

      const minersBlock = await useMinerBlockFixture(node.chain, 2, accountA)
      await node.chain.addBlock(minersBlock)
      await node.wallet.updateHead()

      const transaction1 = await useTxFixture(
        node.wallet,
        accountA,
        accountB,
        undefined,
        1n,
        undefined,
        false,
      )

      const transaction2 = await useTxFixture(
        node.wallet,
        accountA,
        accountB,
        undefined,
        2n,
        undefined,
        false,
      )

      expect(transaction1.spends[0].nullifier.equals(transaction2.spends[0].nullifier)).toBe(
        true,
      )
      expect(transaction1.hash().equals(transaction2.hash())).toBe(false)

      const block = await useMinerBlockFixture(node.chain, undefined, accountA, undefined, [
        transaction1,
      ])

      await chain.addBlock(block)

      memPool.acceptTransaction(transaction2)

      await chain.removeBlock(block.header.hash)

      expect(memPool.exists(transaction1.hash())).toBe(false)
      expect(memPool.exists(transaction2.hash())).toBe(true)
    })

    it('adds back in transactions with overlapping nullifiers if fee is greater', async () => {
      const { node, chain } = nodeTest
      const { wallet, memPool } = node
      const accountA = await useAccountFixture(wallet, 'accountA')
      const accountB = await useAccountFixture(wallet, 'accountB')

      const minersBlock = await useMinerBlockFixture(node.chain, 2, accountA)
      await node.chain.addBlock(minersBlock)
      await node.wallet.updateHead()

      const transaction1 = await useTxFixture(
        node.wallet,
        accountA,
        accountB,
        undefined,
        2n,
        undefined,
        false,
      )

      const transaction2 = await useTxFixture(
        node.wallet,
        accountA,
        accountB,
        undefined,
        1n,
        undefined,
        false,
      )

      expect(transaction1.spends[0].nullifier.equals(transaction2.spends[0].nullifier)).toBe(
        true,
      )
      expect(transaction1.hash().equals(transaction2.hash())).toBe(false)

      const block = await useMinerBlockFixture(node.chain, undefined, accountA, undefined, [
        transaction1,
      ])

      await chain.addBlock(block)

      memPool.acceptTransaction(transaction2)

      await chain.removeBlock(block.header.hash)

      expect(memPool.exists(transaction1.hash())).toBe(true)
      expect(memPool.exists(transaction2.hash())).toBe(false)
    })
  })
})
