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

      it('returns false', () => {
        const { node } = nodeTest

        expect(node.memPool.exists(Buffer.from('fake-hash'))).toBe(false)
      })
    })

    describe('with a valid hash', () => {
      const nodeTest = createNodeTest()

      it('returns true', () => {
        const { node } = nodeTest

        expect(node.memPool.exists(Buffer.from('fake-hash'))).toBe(false)
      })
    })
  })

  describe('get', () => {
    const nodeTest = createNodeTest()

    it('returns transactions from the node mempool sorted by fees', async () => {
      const { node } = nodeTest
      const { accounts, memPool } = node
      const accountA = await useAccountFixture(accounts, 'accountA')
      const accountB = await useAccountFixture(accounts, 'accountB')
      const { transaction: transactionA } = await useBlockWithTx(node, accountA, accountB)
      const { transaction: transactionB } = await useBlockWithTx(node, accountA, accountB)
      const { transaction: transactionC } = await useBlockWithTx(node, accountA, accountB)

      jest.spyOn(transactionA, 'fee').mockImplementationOnce(() => Promise.resolve(BigInt(1)))
      jest.spyOn(transactionB, 'fee').mockImplementationOnce(() => Promise.resolve(BigInt(4)))
      jest.spyOn(transactionC, 'fee').mockImplementationOnce(() => Promise.resolve(BigInt(3)))

      await memPool.acceptTransaction(transactionA)
      await memPool.acceptTransaction(transactionB)
      await memPool.acceptTransaction(transactionC)

      const transactions = Array.from(memPool.get())
      expect(transactions).toEqual([transactionB, transactionC, transactionA])
    }, 60000)

    it('does not return transactions that have been removed from the mempool', async () => {
      const { node } = nodeTest
      const { accounts, memPool } = node
      const accountA = await useAccountFixture(accounts, 'accountA')
      const accountB = await useAccountFixture(accounts, 'accountB')
      const { transaction: transactionA } = await useBlockWithTx(node, accountA, accountB)
      const { transaction: transactionB } = await useBlockWithTx(node, accountA, accountB)

      jest.spyOn(transactionA, 'fee').mockImplementationOnce(() => Promise.resolve(BigInt(1)))
      jest.spyOn(transactionB, 'fee').mockImplementationOnce(() => Promise.resolve(BigInt(4)))

      await memPool.acceptTransaction(transactionA)
      await memPool.acceptTransaction(transactionB)

      const generator = memPool.get()
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
        const { queue, transactions } = memPool
        const add = jest.spyOn(queue, 'add')
        const set = jest.spyOn(transactions, 'set')
        const accountA = await useAccountFixture(accounts, 'accountA')
        const accountB = await useAccountFixture(accounts, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)

        await memPool.acceptTransaction(transaction)

        const hash = transaction.hash()
        expect(add).toHaveBeenCalledTimes(1)
        expect(add).toHaveBeenCalledWith({ fee: await transaction.fee(), hash })
        expect(set).toHaveBeenCalledTimes(1)
        expect(set).toHaveBeenCalledWith(hash, transaction)
      }, 60000)
    })
  })

  describe('when a block is connected with a transaction in the mempool', () => {
    const nodeTest = createNodeTest()

    it('removes the block transactions and expired transactions from the mempool', async () => {
      const { node, chain } = nodeTest
      const { accounts, memPool } = node
      const { queue, transactions } = memPool
      const removeOne = jest.spyOn(queue, 'removeOne')
      const accountA = await useAccountFixture(accounts, 'accountA')
      const accountB = await useAccountFixture(accounts, 'accountB')
      const { transaction: transactionA } = await useBlockWithTx(node, accountA, accountB)
      const { block, transaction: transactionB } = await useBlockWithTx(
        node,
        accountA,
        accountB,
      )
      const hashA = transactionA.hash()
      const hashB = transactionB.hash()

      await memPool.acceptTransaction(transactionA)
      await memPool.acceptTransaction(transactionB)
      expect(transactions.get(hashA)).not.toBeUndefined()
      expect(transactions.get(hashB)).not.toBeUndefined()

      jest.spyOn(transactionA, 'expirationSequence').mockImplementation(() => 1)
      await chain.addBlock(block)

      expect(transactions.get(hashA)).toBeUndefined()
      expect(transactions.get(hashB)).toBeUndefined()
      expect(removeOne).toHaveBeenCalled()
    }, 60000)
  })

  describe('when a block is disconnected', () => {
    const nodeTest = createNodeTest()

    it('adds the block transactions to the mempool', async () => {
      const { node, chain } = nodeTest
      const { accounts, memPool } = node
      const { queue, transactions } = memPool
      const add = jest.spyOn(queue, 'add')
      const accountA = await useAccountFixture(accounts, 'accountA')
      const accountB = await useAccountFixture(accounts, 'accountB')
      const { block } = await useBlockWithTx(node, accountA, accountB)

      // TODO: Remove this and use return value of useBlockWithTx when miners
      // miners fee is always first on the block
      let minersFee
      let transaction
      for (const tx of block.transactions) {
        if (await tx.isMinersFee()) {
          minersFee = tx
        } else {
          transaction = tx
        }
      }
      Assert.isNotUndefined(minersFee)
      Assert.isNotUndefined(transaction)

      await chain.addBlock(block)

      await chain.removeBlock(block.header.hash)

      const hash = transaction.hash()
      expect(transactions.get(hash)).not.toBeUndefined()
      expect(add).toHaveBeenCalledWith({ fee: await transaction.fee(), hash })

      const minersHash = minersFee.hash()
      expect(transactions.get(minersHash)).toBeUndefined()
      expect(add).not.toHaveBeenCalledWith({
        fee: await block.minersFee.fee(),
        hash: minersHash,
      })
    }, 60000)
  })
})
