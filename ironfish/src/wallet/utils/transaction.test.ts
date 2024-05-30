/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { Assert } from '../../assert'
import {
  createNodeTest,
  useAccountFixture,
  useBlockWithTx,
  useBurnBlockFixture,
  useMinerBlockFixture,
  useMintBlockFixture,
  useTxFixture,
} from '../../testUtilities'
import {
  getTransactionStatus,
  getTransactionType,
  TransactionStatus,
  TransactionType,
} from './transaction'

describe('Wallet Transaction Utils', () => {
  const nodeTest = createNodeTest()

  describe('getTransactionStatus', () => {
    it('should show unconfirmed transactions as unconfirmed', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'a')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)

      await node.wallet.updateHead()

      const transaction = blockA1.minersFee

      const transactionValue = await accountA.getTransaction(transaction.hash())
      Assert.isNotUndefined(transactionValue)
      Assert.isNotNull(transactionValue.sequence)

      const transactionStatus = await getTransactionStatus(accountA, transactionValue, 0, {
        headSequence: transactionValue.sequence - 1,
      })

      expect(transactionStatus).toEqual(TransactionStatus.UNCONFIRMED)
    })

    it('should show confirmed transactions as confirmed', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'a')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)

      await node.wallet.updateHead()

      const transaction = blockA1.minersFee

      const transactionValue = await accountA.getTransaction(transaction.hash())
      Assert.isNotUndefined(transactionValue)

      // Get status as if head of wallet were much later
      const transactionStatus = await getTransactionStatus(accountA, transactionValue, 0, {
        headSequence: 100000,
      })

      expect(transactionStatus).toEqual(TransactionStatus.CONFIRMED)
    })

    it('should show pending transactions as pending', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'a')
      const accountB = await useAccountFixture(node.wallet, 'b')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)

      await node.wallet.updateHead()

      const transaction = await useTxFixture(node.wallet, accountA, accountB)

      const transactionValue = await accountA.getTransaction(transaction.hash())
      Assert.isNotUndefined(transactionValue)

      const transactionStatus = await getTransactionStatus(accountA, transactionValue, 0)

      expect(transactionStatus).toEqual(TransactionStatus.PENDING)
    })

    it('should show expired transactions as expired', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'a')
      const accountB = await useAccountFixture(node.wallet, 'b')

      const blockA2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA2)

      await node.wallet.updateHead()

      const transaction = await useTxFixture(
        node.wallet,
        accountA,
        accountB,
        undefined,
        undefined,
        3,
      )

      const blockA3 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA3)

      await node.wallet.updateHead()

      const transactionValue = await accountA.getTransaction(transaction.hash())
      Assert.isNotUndefined(transactionValue)

      const transactionStatus = await getTransactionStatus(accountA, transactionValue, 0)

      expect(transactionStatus).toEqual(TransactionStatus.EXPIRED)
    })

    it('should show transactions with 0 expiration as pending', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'a')
      const accountB = await useAccountFixture(node.wallet, 'b')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)

      await node.wallet.updateHead()

      const transaction = await useTxFixture(
        node.wallet,
        accountA,
        accountB,
        undefined,
        undefined,
        0,
      )

      const transactionValue = await accountA.getTransaction(transaction.hash())
      Assert.isNotUndefined(transactionValue)

      // Get status as if head of wallet were much later
      const transactionStatus = await getTransactionStatus(accountA, transactionValue, 0, {
        headSequence: 100000,
      })

      expect(transactionStatus).toEqual(TransactionStatus.PENDING)
    })

    it('should show unknown status if account has no head sequence', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'a')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)

      await node.wallet.updateHead()

      const transaction = blockA1.minersFee

      const transactionValue = await accountA.getTransaction(transaction.hash())
      Assert.isNotUndefined(transactionValue)
      Assert.isNotNull(transactionValue.sequence)

      await nodeTest.wallet.walletDb.saveHead(accountA, null)

      const transactionStatus = await getTransactionStatus(accountA, transactionValue, 0)

      expect(transactionStatus).toEqual(TransactionStatus.UNKNOWN)
    })

    describe('getTransactionType', () => {
      it('should return miner type for minersFee transactions', async () => {
        const { node } = await nodeTest.createSetup()

        const accountA = await useAccountFixture(node.wallet, 'a')

        const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
        await expect(node.chain).toAddBlock(blockA1)
        await node.wallet.updateHead()

        const transaction = blockA1.transactions[0]

        const transactionValue = await accountA.getTransaction(transaction.hash())

        Assert.isNotUndefined(transactionValue)

        await expect(getTransactionType(accountA, transactionValue)).resolves.toEqual(
          TransactionType.MINER,
        )
      })

      it('should return send type for outgoing transactions', async () => {
        const { node } = await nodeTest.createSetup()

        const accountA = await useAccountFixture(node.wallet, 'a')
        const accountB = await useAccountFixture(node.wallet, 'b')

        const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
        await expect(node.chain).toAddBlock(blockA1)
        await node.wallet.updateHead()

        const { block: blockA2, transaction } = await useBlockWithTx(node, accountA, accountB)
        await expect(node.chain).toAddBlock(blockA2)
        await node.wallet.updateHead()

        const transactionValue = await accountA.getTransaction(transaction.hash())

        Assert.isNotUndefined(transactionValue)

        await expect(getTransactionType(accountA, transactionValue)).resolves.toEqual(
          TransactionType.SEND,
        )
      })

      it('should return send type for mint transactions', async () => {
        const { node } = await nodeTest.createSetup()

        const account = await useAccountFixture(node.wallet, 'a')

        const blockA1 = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
        await expect(node.chain).toAddBlock(blockA1)
        await node.wallet.updateHead()

        const asset = new Asset(account.publicAddress, 'fakeasset', 'metadata')
        const value = BigInt(10)
        const mintBlock = await useMintBlockFixture({
          node,
          account,
          asset,
          value,
          sequence: 3,
        })
        await expect(node.chain).toAddBlock(mintBlock)
        await node.wallet.updateHead()

        const transaction = mintBlock.transactions.find((tx) => !tx.isMinersFee())

        Assert.isNotUndefined(transaction)

        const transactionValue = await account.getTransaction(transaction.hash())

        Assert.isNotUndefined(transactionValue)

        await expect(getTransactionType(account, transactionValue)).resolves.toEqual(
          TransactionType.SEND,
        )
      })

      it('should return send type for burn transactions', async () => {
        const { node } = await nodeTest.createSetup()

        const account = await useAccountFixture(node.wallet, 'a')

        const blockA1 = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
        await expect(node.chain).toAddBlock(blockA1)
        await node.wallet.updateHead()

        const asset = new Asset(account.publicAddress, 'fakeasset', 'metadata')
        const value = BigInt(10)
        const mintBlock = await useMintBlockFixture({
          node,
          account,
          asset,
          value,
          sequence: 3,
        })
        await expect(node.chain).toAddBlock(mintBlock)
        await node.wallet.updateHead()

        const burnValue = BigInt(2)
        const burnBlock = await useBurnBlockFixture({
          node,
          account,
          asset,
          value: burnValue,
          sequence: 4,
        })
        await expect(node.chain).toAddBlock(burnBlock)
        await node.wallet.updateHead()

        const transaction = burnBlock.transactions.find((tx) => !tx.isMinersFee())

        Assert.isNotUndefined(transaction)

        const transactionValue = await account.getTransaction(transaction.hash())

        Assert.isNotUndefined(transactionValue)

        await expect(getTransactionType(account, transactionValue)).resolves.toEqual(
          TransactionType.SEND,
        )
      })

      it('should return receive type for incoming transactions', async () => {
        const { node } = await nodeTest.createSetup()

        const accountA = await useAccountFixture(node.wallet, 'a')
        const accountB = await useAccountFixture(node.wallet, 'b')

        const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
        await expect(node.chain).toAddBlock(blockA1)
        await node.wallet.updateHead()

        const { block: blockA2, transaction } = await useBlockWithTx(node, accountA, accountB)
        await expect(node.chain).toAddBlock(blockA2)
        await node.wallet.updateHead()

        const transactionValue = await accountB.getTransaction(transaction.hash())

        Assert.isNotUndefined(transactionValue)

        await expect(getTransactionType(accountB, transactionValue)).resolves.toEqual(
          TransactionType.RECEIVE,
        )
      })
    })
  })
})
