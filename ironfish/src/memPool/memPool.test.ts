/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createNodeTest, useAccountFixture, useBlockWithTx } from '../testUtilities'

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

    it('returns transactions from the node mempool', async () => {
      const { node } = nodeTest
      const { accounts, memPool } = node
      const accountA = await useAccountFixture(accounts, 'accountA')
      const accountB = await useAccountFixture(accounts, 'accountB')
      const { transaction } = await useBlockWithTx(node, accountA, accountB)

      await memPool.acceptTransaction(transaction)

      const transactions = Array.from(memPool.get())
      expect(transactions).toHaveLength(1)
      expect(transactions[0]).toEqual(transaction)
    }, 60000)
  })

  describe('acceptTransaction', () => {
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

      it('sets the transaction hash in the mempool', async () => {
        const { node } = nodeTest
        const { accounts, memPool } = node
        const { transactions } = memPool
        const set = jest.spyOn(transactions, 'set')
        const accountA = await useAccountFixture(accounts, 'accountA')
        const accountB = await useAccountFixture(accounts, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)

        await memPool.acceptTransaction(transaction)

        expect(set).toHaveBeenCalledTimes(1)
        expect(set).toHaveBeenCalledWith(transaction.transactionHash(), transaction)
      }, 60000)
    })
  })
})
