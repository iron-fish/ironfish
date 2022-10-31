/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import { GENESIS_BLOCK_SEQUENCE, VerificationResultReason } from '../consensus'
import {
  createNodeTest,
  useAccountFixture,
  useMinerBlockFixture,
  useMinersTxFixture,
  useTxFixture,
} from '../testUtilities'
import { AsyncUtils } from '../utils'
import { TransactionStatus } from '../wallet'

describe('Accounts', () => {
  const nodeTest = createNodeTest()

  it('should reset when chain processor head does not exist in chain', async () => {
    const { node, strategy } = nodeTest
    strategy.disableMiningReward()

    const resetSpy = jest.spyOn(node.wallet, 'reset').mockImplementation()
    jest.spyOn(node.wallet, 'eventLoop').mockImplementation(() => Promise.resolve())

    node.wallet['chainProcessor'].hash = Buffer.from('0')

    await node.wallet.start()
    expect(resetSpy).toBeCalledTimes(1)
  })

  it('should handle transaction created on fork', async () => {
    const { node: nodeA } = await nodeTest.createSetup()
    const { node: nodeB } = await nodeTest.createSetup()

    const accountA = await useAccountFixture(nodeA.wallet, 'a')
    const accountB = await useAccountFixture(nodeA.wallet, 'b')

    const broadcastSpy = jest.spyOn(nodeA.wallet, 'broadcastTransaction')

    const blockA1 = await useMinerBlockFixture(nodeA.chain, undefined, accountA, nodeA.wallet)
    await expect(nodeA.chain).toAddBlock(blockA1)

    const blockB1 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
    await expect(nodeB.chain).toAddBlock(blockB1)
    const blockB2 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
    await expect(nodeB.chain).toAddBlock(blockB2)

    // Check nodeA balance
    await nodeA.wallet.updateHead()
    await expect(nodeA.wallet.getBalance(accountA)).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      pending: BigInt(2000000000),
    })

    // This transaction will be invalid after the reorg
    const invalidTx = await useTxFixture(nodeA.wallet, accountA, accountB)
    expect(broadcastSpy).toHaveBeenCalledTimes(0)

    await nodeA.wallet.updateHead()
    await expect(nodeA.wallet.getBalance(accountA)).resolves.toMatchObject({
      confirmed: BigInt(0),
      pending: BigInt(1999999999),
    })

    await expect(nodeA.chain).toAddBlock(blockB1)
    await expect(nodeA.chain).toAddBlock(blockB2)
    expect(nodeA.chain.head.hash.equals(blockB2.header.hash)).toBe(true)

    // We now have this tree with nodeA's wallet trying to spend a note in
    // invalidTx that has been removed once A1 was disconnected from the
    // blockchain after the reorg
    //
    // G -> A1
    //   -> B2 -> B3

    // The transaction should now be considered invalid
    await expect(nodeA.chain.verifier.verifyTransactionAdd(invalidTx)).resolves.toMatchObject({
      reason: VerificationResultReason.INVALID_SPEND,
      valid: false,
    })

    await nodeA.wallet.updateHead()
    await expect(nodeA.wallet.getBalance(accountA)).resolves.toMatchObject({
      confirmed: BigInt(0),
      pending: BigInt(3999999999),
    })

    // Check that it was last broadcast at its added height
    let invalidTxEntry = await accountA.getTransaction(invalidTx.hash())
    expect(invalidTxEntry?.submittedSequence).toEqual(GENESIS_BLOCK_SEQUENCE)

    // Check that the TX is not rebroadcast but has it's sequence updated
    nodeA.wallet['rebroadcastAfter'] = 1
    nodeA.wallet['isStarted'] = true
    nodeA.chain['synced'] = true
    await nodeA.wallet.rebroadcastTransactions()
    expect(broadcastSpy).toHaveBeenCalledTimes(0)

    // It should now be planned to be processed at head + 1
    invalidTxEntry = await accountA.getTransaction(invalidTx.hash())
    expect(invalidTxEntry?.submittedSequence).toEqual(blockB2.header.sequence)
  })

  describe('updateHeadHash', () => {
    it('should update head hashes for all existing accounts', async () => {
      const { node } = nodeTest

      const newHeadHash = Buffer.alloc(32, 1)

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const saveHeadHashSpy = jest.spyOn(node.wallet.walletDb, 'saveHeadHash')

      await node.wallet.updateHeadHashes(newHeadHash)

      expect(saveHeadHashSpy).toHaveBeenCalledTimes(2)
      expect(saveHeadHashSpy).toHaveBeenNthCalledWith(
        1,
        accountA,
        newHeadHash,
        expect.anything(),
      )
      expect(saveHeadHashSpy).toHaveBeenNthCalledWith(
        2,
        accountB,
        newHeadHash,
        expect.anything(),
      )
    })
  })

  describe('scanTransactions', () => {
    it('should update head status', async () => {
      // G -> 1 -> 2
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const block1 = await useMinerBlockFixture(node.chain, 2, accountA)
      await expect(node.chain).toAddBlock(block1)
      await node.wallet.updateHead()

      const accountB = await useAccountFixture(node.wallet, 'accountB')
      const block2 = await useMinerBlockFixture(node.chain, 2, accountA)
      await expect(node.chain).toAddBlock(block2)

      expect(node.wallet['headHashes'].get(accountA.id)).toEqual(block1.header.hash)
      expect(node.wallet['headHashes'].get(accountB.id)).toEqual(null)

      await node.wallet.updateHead()

      // Confirm pre-rescan state
      expect(node.wallet['headHashes'].get(accountA.id)).toEqual(block2.header.hash)
      expect(node.wallet['headHashes'].get(accountB.id)).toEqual(null)

      await node.wallet.scanTransactions()

      expect(node.wallet['headHashes'].get(accountA.id)).toEqual(block2.header.hash)
      expect(node.wallet['headHashes'].get(accountB.id)).toEqual(block2.header.hash)
    })

    it('should rescan and update chain processor', async () => {
      const { chain, wallet } = nodeTest

      await useAccountFixture(wallet, 'accountA')

      const block1 = await useMinerBlockFixture(chain)
      await expect(chain).toAddBlock(block1)

      // Test this works even if processor is not reset
      await wallet.updateHead()
      expect(wallet['chainProcessor']['hash']?.equals(block1.header.hash)).toBe(true)

      const block2 = await useMinerBlockFixture(chain)
      await expect(chain).toAddBlock(block2)

      // Should only scan up to the current processor head block1
      await wallet.scanTransactions()
      expect(wallet['chainProcessor']['hash']?.equals(block1.header.hash)).toBe(true)

      // Now with a reset chain processor should go to end of chain
      await wallet.reset()
      expect(wallet['chainProcessor']['hash']).toBe(null)

      // This should carry the chain processor to block2
      await wallet.scanTransactions()
      expect(wallet['chainProcessor']['hash']?.equals(block2.header.hash)).toBe(true)
    })
  })

  describe('getBalance', () => {
    it('returns balances for unspent notes with minimum confirmations on the main chain', async () => {
      const { node: nodeA } = await nodeTest.createSetup({
        config: { minimumBlockConfirmations: 2 },
      })
      const { node: nodeB } = await nodeTest.createSetup()
      const accountA = await useAccountFixture(nodeA.wallet, 'accountA')
      const accountB = await useAccountFixture(nodeB.wallet, 'accountB')

      // G -> A1 -> A2 -> A3 -> A4 -> A5
      //   -> B1 -> B2 -> B3 -> B4
      const blockA1 = await useMinerBlockFixture(nodeA.chain, 2, accountA)
      await nodeA.chain.addBlock(blockA1)
      const blockA2 = await useMinerBlockFixture(nodeA.chain, 3, accountA)
      await nodeA.chain.addBlock(blockA2)
      const blockA3 = await useMinerBlockFixture(nodeA.chain, 4, accountA)
      await nodeA.chain.addBlock(blockA3)
      const blockA4 = await useMinerBlockFixture(nodeA.chain, 5, accountA)
      await nodeA.chain.addBlock(blockA4)
      const blockA5 = await useMinerBlockFixture(nodeA.chain, 6, accountA)
      await nodeA.chain.addBlock(blockA5)

      const blockB1 = await useMinerBlockFixture(nodeB.chain, 2, accountB)
      await nodeB.chain.addBlock(blockB1)
      const blockB2 = await useMinerBlockFixture(nodeB.chain, 3, accountB)
      await nodeB.chain.addBlock(blockB2)
      const blockB3 = await useMinerBlockFixture(nodeB.chain, 4, accountB)
      await nodeB.chain.addBlock(blockB3)
      const blockB4 = await useMinerBlockFixture(nodeB.chain, 5, accountB)
      await nodeB.chain.addBlock(blockB4)

      expect(nodeA.chain.head.hash.equals(blockA5.header.hash)).toBe(true)
      expect(nodeB.chain.head.hash.equals(blockB4.header.hash)).toBe(true)

      await nodeB.chain.addBlock(blockA1)
      await nodeB.chain.addBlock(blockA2)
      await nodeB.chain.addBlock(blockA3)
      await nodeB.chain.addBlock(blockA4)
      await nodeB.chain.addBlock(blockA5)

      await nodeA.wallet.updateHead()
      await nodeB.wallet.updateHead()

      expect(nodeA.chain.head.hash.equals(blockA5.header.hash)).toBe(true)
      expect(nodeB.chain.head.hash.equals(blockA5.header.hash)).toBe(true)

      expect(await nodeA.wallet.getBalance(accountA)).toMatchObject({
        confirmed: BigInt(6000000000),
        pending: BigInt(10000000000),
      })
      expect(await nodeB.wallet.getBalance(accountB)).toMatchObject({
        confirmed: BigInt(0),
        pending: BigInt(0),
      })
    })
  })

  describe('getEarliestHeadHash', () => {
    it('should return the earliest head hash', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')
      const accountC = await useAccountFixture(node.wallet, 'accountC')
      await useAccountFixture(node.wallet, 'accountD')

      const blockA = await useMinerBlockFixture(node.chain, 2, accountA)
      await node.chain.addBlock(blockA)
      const blockB = await useMinerBlockFixture(node.chain, 3, accountA)
      await node.chain.addBlock(blockB)

      node.wallet['headHashes'].set(accountA.id, blockA.header.hash)
      node.wallet['headHashes'].set(accountB.id, blockB.header.hash)
      node.wallet['headHashes'].set(accountC.id, null)

      expect(await node.wallet.getEarliestHeadHash()).toEqual(null)
    })
  })

  describe('getLatestHeadHash', () => {
    it('should return the latest head hash', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')
      const accountC = await useAccountFixture(node.wallet, 'accountC')
      await useAccountFixture(node.wallet, 'accountD')

      const blockA = await useMinerBlockFixture(node.chain, 2, accountA)
      await node.chain.addBlock(blockA)
      const blockB = await useMinerBlockFixture(node.chain, 3, accountA)
      await node.chain.addBlock(blockB)

      node.wallet['headHashes'].set(accountA.id, blockA.header.hash)
      node.wallet['headHashes'].set(accountB.id, blockB.header.hash)
      node.wallet['headHashes'].set(accountC.id, null)

      expect(await node.wallet.getLatestHeadHash()).toEqual(blockB.header.hash)
    })
  })

  describe('loadHeadHashes', () => {
    it('should properly saturate headStatus', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const blockA = await useMinerBlockFixture(node.chain, 2, accountA)
      await node.chain.addBlock(blockA)

      await node.wallet.updateHead()

      const accountB = await useAccountFixture(node.wallet, 'accountB')
      const blockB = await useMinerBlockFixture(node.chain, 2, accountA)
      await node.chain.addBlock(blockB)

      await node.wallet.updateHead()

      await node.wallet.close()
      expect(node.wallet['headHashes'].get(accountA.id)).toEqual(undefined)
      expect(node.wallet['headHashes'].get(accountB.id)).toEqual(undefined)

      await node.wallet.open()
      expect(node.wallet['headHashes'].get(accountA.id)).toEqual(blockB.header.hash)
      expect(node.wallet['headHashes'].get(accountB.id)).toEqual(null)
    })
  })

  describe('importAccount', () => {
    it('should not import accounts with duplicate name', async () => {
      const { node } = nodeTest

      const account = await useAccountFixture(node.wallet, 'accountA')

      expect(node.wallet.accountExists(account.name)).toEqual(true)

      await expect(node.wallet.importAccount(account)).rejects.toThrowError(
        'Account already exists with the name',
      )
    })

    it('should not import accounts with duplicate keys', async () => {
      const { node } = nodeTest

      const account = await useAccountFixture(node.wallet, 'accountA')

      expect(node.wallet.accountExists(account.name)).toEqual(true)

      const clone = { ...account }
      clone.name = 'Different name'

      await expect(node.wallet.importAccount(clone)).rejects.toThrowError(
        'Account already exists with provided spending key',
      )
    })
  })

  describe('expireTransactions', () => {
    it('should not expire transactions with expiration sequence ahead of the chain', async () => {
      const { node } = nodeTest
      node.chain['synced'] = true

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const block1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block1)

      await node.wallet.updateHead()

      await useTxFixture(
        node.wallet,
        accountA,
        accountB,
        undefined,
        undefined,
        node.chain.head.sequence + 1,
      )

      const expireSpy = jest.spyOn(accountA, 'expireTransaction')

      await node.wallet.expireTransactions()

      expect(expireSpy).toHaveBeenCalledTimes(0)
    })

    it('should not expire transactions with expiration sequence of 0', async () => {
      const { node } = nodeTest
      node.chain['synced'] = true

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const block1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block1)

      await node.wallet.updateHead()

      await useTxFixture(node.wallet, accountA, accountB, undefined, undefined, 0)

      const expireSpy = jest.spyOn(accountA, 'expireTransaction')

      await node.wallet.expireTransactions()

      expect(expireSpy).toHaveBeenCalledTimes(0)
    })

    it('should expire transactions for all affected accounts', async () => {
      const { node } = nodeTest
      node.chain['synced'] = true
      node.wallet['isStarted'] = true

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const block1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block1)

      await node.wallet.updateHead()

      await useTxFixture(node.wallet, accountA, accountB, undefined, undefined, 1)

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)

      await node.wallet.updateHead()

      let expiredA = await AsyncUtils.materialize(
        accountA.getExpiredTransactions(node.chain.head.sequence),
      )
      expect(expiredA.length).toEqual(1)

      let expiredB = await AsyncUtils.materialize(
        accountB.getExpiredTransactions(node.chain.head.sequence),
      )
      expect(expiredB.length).toEqual(1)

      await node.wallet.expireTransactions()

      expiredA = await AsyncUtils.materialize(
        accountA.getExpiredTransactions(node.chain.head.sequence),
      )
      expect(expiredA.length).toEqual(0)

      expiredB = await AsyncUtils.materialize(
        accountB.getExpiredTransactions(node.chain.head.sequence),
      )
      expect(expiredB.length).toEqual(0)
    })

    it('should only expire transactions one time', async () => {
      const { node } = nodeTest
      node.chain['synced'] = true
      node.wallet['isStarted'] = true

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const block1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block1)

      await node.wallet.updateHead()

      const transaction = await useTxFixture(
        node.wallet,
        accountA,
        accountB,
        undefined,
        undefined,
        1,
      )

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)

      await node.wallet.updateHead()

      const expireSpy = jest.spyOn(accountA, 'expireTransaction')

      await node.wallet.expireTransactions()

      expect(expireSpy).toHaveBeenCalledTimes(1)
      expect(expireSpy).toHaveBeenCalledWith(transaction)

      expireSpy.mockClear()

      await node.wallet.expireTransactions()

      expect(expireSpy).toHaveBeenCalledTimes(0)
    })
  })

  describe('removeAccount', () => {
    it('should delete account', async () => {
      const node = nodeTest.node
      node.wallet['isStarted'] = true

      const account = await useAccountFixture(node.wallet)
      const tx = await useMinersTxFixture(node.wallet, account)
      await node.wallet.syncTransaction(tx, {})

      await expect(
        node.wallet.walletDb.loadTransaction(account, tx.hash()),
      ).resolves.not.toBeNull()

      expect(node.wallet.getAccountByName(account.name)).toMatchObject({
        id: account.id,
      })

      await node.wallet.removeAccount(account.name)

      expect(node.wallet.getAccountByName(account.name)).toBeNull()

      // It should not be cleand yet
      await expect(
        node.wallet.walletDb.loadTransaction(account, tx.hash()),
      ).resolves.not.toBeUndefined()

      await node.wallet.cleanupDeletedAccounts()

      // It should be removed now
      await expect(
        node.wallet.walletDb.loadTransaction(account, tx.hash()),
      ).resolves.toBeUndefined()
    })
  })

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

      const transactionStatus = await node.wallet.getTransactionStatus(
        accountA,
        transactionValue,
        {
          headSequence: transactionValue.sequence - 1,
        },
      )

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
      const transactionStatus = await node.wallet.getTransactionStatus(
        accountA,
        transactionValue,
        {
          headSequence: 100000,
        },
      )

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

      const transactionStatus = await node.wallet.getTransactionStatus(
        accountA,
        transactionValue,
      )

      expect(transactionStatus).toEqual(TransactionStatus.PENDING)
    })

    it('should show expired transactions as expired', async () => {
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
        1,
      )

      const transactionValue = await accountA.getTransaction(transaction.hash())
      Assert.isNotUndefined(transactionValue)

      const transactionStatus = await node.wallet.getTransactionStatus(
        accountA,
        transactionValue,
      )

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
      const transactionStatus = await node.wallet.getTransactionStatus(
        accountA,
        transactionValue,
        {
          headSequence: 100000,
        },
      )

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

      await nodeTest.wallet.walletDb.saveHeadHash(accountA, null)

      const transactionStatus = await node.wallet.getTransactionStatus(
        accountA,
        transactionValue,
      )

      expect(transactionStatus).toEqual(TransactionStatus.UNKNOWN)
    })
  })

  describe('rebroadcastTransactions', () => {
    it('should not rebroadcast expired transactions', async () => {
      const { node } = nodeTest
      node.chain['synced'] = true
      node.wallet['isStarted'] = true
      node.wallet['rebroadcastAfter'] = 0

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const block1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block1)
      await node.wallet.updateHead()

      // create expired transaction
      const transaction = await useTxFixture(
        node.wallet,
        accountA,
        accountA,
        undefined,
        undefined,
        2,
      )

      const transactionValue = await accountA.getTransaction(transaction.hash())
      Assert.isNotUndefined(transactionValue)

      const transactionStatus = await node.wallet.getTransactionStatus(
        accountA,
        transactionValue,
      )
      expect(transactionStatus).toEqual(TransactionStatus.EXPIRED)

      const broadcastSpy = jest.spyOn(node.wallet, 'broadcastTransaction')

      await node.wallet.rebroadcastTransactions()

      expect(broadcastSpy).toHaveBeenCalledTimes(0)
    })
  })
})
