/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import {
  createNodeTest,
  useAccountFixture,
  useBlockWithTx,
  useMinersTxFixture,
} from '../testUtilities'

describe('MemPool', () => {
  describe('size', () => {
    const nodeTest = createNodeTest()

    it('returns the number of transactions in the node', async () => {
      const { node } = nodeTest
      const { accounts, memPool } = node
      const accountA = await useAccountFixture(accounts, 'accountA')
      const accountB = await useAccountFixture(accounts, 'accountB')
      const { transaction } = await useBlockWithTx(node, accountA, accountB)

      await memPool.acceptTransaction(transaction)

      expect(memPool.size()).toBe(1)
    }, 60000)
  })

  describe('exists', () => {
    describe('with a missing hash', () => {
      const nodeTest = createNodeTest()

      it('returns false', async () => {
        const { node } = nodeTest
        const { accounts, memPool } = node
        const accountA = await useAccountFixture(accounts, 'accountA')
        const accountB = await useAccountFixture(accounts, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)

        expect(memPool.exists(transaction.hash())).toBe(false)
      })
    })

    describe('with a valid hash', () => {
      const nodeTest = createNodeTest()

      it('returns true', async () => {
        const { node } = nodeTest
        const { accounts, memPool } = node
        const accountA = await useAccountFixture(accounts, 'accountA')
        const accountB = await useAccountFixture(accounts, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)

        expect(memPool.exists(transaction.hash())).toBe(false)
      })
    })
  })

  describe('orderedTransactions', () => {
    const nodeTest = createNodeTest()

    it('returns transactions from the node mempool sorted by fees', async () => {
      const { node } = nodeTest
      const { accounts, memPool } = node
      const accountA = await useAccountFixture(accounts, 'accountA')
      const accountB = await useAccountFixture(accounts, 'accountB')
      const accountC = await useAccountFixture(accounts, 'accountC')
      const { transaction: transactionA } = await useBlockWithTx(node, accountA, accountB)
      const { transaction: transactionB } = await useBlockWithTx(node, accountB, accountC)
      const { transaction: transactionC } = await useBlockWithTx(node, accountC, accountA)

      jest.spyOn(transactionA, 'fee').mockImplementationOnce(() => BigInt(1))
      jest.spyOn(transactionB, 'fee').mockImplementationOnce(() => BigInt(4))
      jest.spyOn(transactionC, 'fee').mockImplementationOnce(() => BigInt(3))

      await memPool.acceptTransaction(transactionA)
      await memPool.acceptTransaction(transactionB)
      await memPool.acceptTransaction(transactionC)

      const transactions = Array.from(memPool.orderedTransactions())
      expect(transactions).toEqual([transactionB, transactionC, transactionA])
    }, 60000)

    it('does not return transactions that have been removed from the mempool', async () => {
      const { node } = nodeTest
      const { accounts, memPool } = node
      const accountA = await useAccountFixture(accounts, 'accountA')
      const accountB = await useAccountFixture(accounts, 'accountB')
      const { transaction: transactionA } = await useBlockWithTx(node, accountA, accountB)
      const { transaction: transactionB } = await useBlockWithTx(node, accountA, accountB)

      jest.spyOn(transactionA, 'fee').mockImplementationOnce(() => BigInt(1))
      jest.spyOn(transactionB, 'fee').mockImplementationOnce(() => BigInt(4))

      await memPool.acceptTransaction(transactionA)
      await memPool.acceptTransaction(transactionB)

      const generator = memPool.orderedTransactions()
      const result = generator.next()
      expect(result.done).toBe(false)

      memPool['deleteTransaction'](transactionA)
      memPool['deleteTransaction'](transactionB)

      const transactions = Array.from(generator)
      expect(transactions).toEqual([])
    }, 60000)
  })

  describe('acceptTransaction', () => {
    describe('with a coinbase transaction', () => {
      const nodeTest = createNodeTest()

      it('returns false', async () => {
        const { node } = nodeTest
        const { memPool } = node
        const account = await useAccountFixture(nodeTest.accounts)
        const transaction = await useMinersTxFixture(nodeTest.accounts, account)

        expect(await memPool.acceptTransaction(transaction)).toBe(false)
      }, 60000)
    })

    describe('with an existing hash in the mempool', () => {
      const nodeTest = createNodeTest()

      it('returns false', async () => {
        const { node } = nodeTest
        const { accounts, memPool } = node
        const accountA = await useAccountFixture(accounts, 'accountA')
        const accountB = await useAccountFixture(accounts, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)

        await memPool.acceptTransaction(transaction)

        expect(await memPool.acceptTransaction(transaction)).toBe(false)
      }, 60000)
    })

    describe('with an expired sequence', () => {
      const nodeTest = createNodeTest()

      it('returns false', async () => {
        const { node } = nodeTest
        const { accounts, chain, memPool } = node
        const accountA = await useAccountFixture(accounts, 'accountA')
        const accountB = await useAccountFixture(accounts, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)

        const isExpiredSequenceSpy = jest
          .spyOn(chain.verifier, 'isExpiredSequence')
          .mockReturnValue(true)

        expect(await memPool.acceptTransaction(transaction)).toBe(false)
        expect(isExpiredSequenceSpy).toHaveBeenCalledTimes(1)
        expect(isExpiredSequenceSpy).lastReturnedWith(true)
      })
    })

    describe('with an existing nullifier in a transaction in the mempool', () => {
      const nodeTest = createNodeTest()

      it('returns false', async () => {
        const { node } = nodeTest
        const { accounts, memPool } = node
        const accountA = await useAccountFixture(accounts, 'accountA')
        const accountB = await useAccountFixture(accounts, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)
        const { transaction: transaction2 } = await useBlockWithTx(node, accountA, accountB)

        expect(transaction.getSpend(0).nullifier).toEqual(transaction2.getSpend(0).nullifier)

        await memPool.acceptTransaction(transaction)

        expect(await memPool.acceptTransaction(transaction2)).toBe(false)
      }, 60000)

      it('returns true with a higher fee', async () => {
        const { node } = nodeTest
        const { accounts, memPool } = node
        const accountA = await useAccountFixture(accounts, 'accountA')
        const accountB = await useAccountFixture(accounts, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)
        const { transaction: transaction2 } = await useBlockWithTx(
          node,
          accountA,
          accountB,
          true,
          { fee: 2 },
        )

        expect(transaction.getSpend(0).nullifier).toEqual(transaction2.getSpend(0).nullifier)

        await memPool.acceptTransaction(transaction)

        expect(await memPool.acceptTransaction(transaction2)).toBe(true)
      }, 60000)
    })

    describe('with a new hash', () => {
      const nodeTest = createNodeTest()

      it('returns true', async () => {
        const { node } = nodeTest
        const { accounts, memPool } = node
        const accountA = await useAccountFixture(accounts, 'accountA')
        const accountB = await useAccountFixture(accounts, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)

        expect(await memPool.acceptTransaction(transaction)).toBe(true)
      }, 60000)

      it('sets the transaction hash in the mempool map and priority queue', async () => {
        const { node } = nodeTest
        const { accounts, memPool } = node
        const accountA = await useAccountFixture(accounts, 'accountA')
        const accountB = await useAccountFixture(accounts, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)

        await memPool.acceptTransaction(transaction)

        expect(memPool.exists(transaction.hash())).toBe(true)
        expect([...memPool.orderedTransactions()]).toContainEqual(transaction)
      }, 60000)
    })

    describe('verification', () => {
      const nodeTest = createNodeTest()

      it('should default to verify the transaction', async () => {
        const { node } = nodeTest
        const { memPool } = node
        const account = await useAccountFixture(nodeTest.accounts)
        const transaction = await useMinersTxFixture(nodeTest.accounts, account)

        const verifyTransactionSpy = jest.spyOn(
          node.chain.verifier,
          'verifyTransactionNoncontextual',
        )

        await memPool.acceptTransaction(transaction)

        expect(verifyTransactionSpy).toHaveBeenCalledTimes(1)
      })

      it('should verify when explicitly passed the parameter', async () => {
        const { node } = nodeTest
        const { memPool } = node
        const account = await useAccountFixture(nodeTest.accounts)
        const transaction = await useMinersTxFixture(nodeTest.accounts, account)

        const verifyTransactionSpy = jest.spyOn(
          node.chain.verifier,
          'verifyTransactionNoncontextual',
        )

        await memPool.acceptTransaction(transaction, true)

        expect(verifyTransactionSpy).toHaveBeenCalledTimes(1)
      })

      it('should be skippable', async () => {
        const { node } = nodeTest
        const { memPool } = node
        const account = await useAccountFixture(nodeTest.accounts)
        const transaction = await useMinersTxFixture(nodeTest.accounts, account)

        const verifyTransactionSpy = jest.spyOn(
          node.chain.verifier,
          'verifyTransactionNoncontextual',
        )

        await memPool.acceptTransaction(transaction, false)

        expect(verifyTransactionSpy).toHaveBeenCalledTimes(0)
      })
    })
  })

  describe('when a block is connected with a transaction in the mempool', () => {
    const nodeTest = createNodeTest()

    it('removes the block transactions and expired transactions from the mempool', async () => {
      const { node, chain } = nodeTest
      const { accounts, memPool } = node
      const accountA = await useAccountFixture(accounts, 'accountA')
      const accountB = await useAccountFixture(accounts, 'accountB')
      const { transaction: transactionA } = await useBlockWithTx(node, accountA, accountB)
      const { block, transaction: transactionB } = await useBlockWithTx(
        node,
        accountB,
        accountA,
      )

      await memPool.acceptTransaction(transactionA)
      await memPool.acceptTransaction(transactionB)
      expect(memPool.exists(transactionA.hash())).toBe(true)
      expect(memPool.exists(transactionB.hash())).toBe(true)

      jest.spyOn(transactionA, 'expirationSequence').mockImplementation(() => 1)
      await chain.addBlock(block)

      expect(memPool.exists(transactionA.hash())).toBe(false)
      expect(memPool.exists(transactionB.hash())).toBe(false)
      expect([...memPool.orderedTransactions()]).not.toContainEqual(transactionA)
      expect([...memPool.orderedTransactions()]).not.toContainEqual(transactionB)
    }, 60000)
  })

  describe('when a block is disconnected', () => {
    const nodeTest = createNodeTest()

    it('adds the block transactions to the mempool', async () => {
      const { node, chain } = nodeTest
      const { accounts, memPool } = node
      const accountA = await useAccountFixture(accounts, 'accountA')
      const accountB = await useAccountFixture(accounts, 'accountB')
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
    }, 60000)
  })
})
