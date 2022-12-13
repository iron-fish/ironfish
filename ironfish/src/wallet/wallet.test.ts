/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset, generateKey } from '@ironfish/rust-nodejs'
import { Assert } from '../assert'
import { VerificationResultReason } from '../consensus'
import {
  createNodeTest,
  useAccountFixture,
  useBlockFixture,
  useBlockWithTx,
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
    expect(resetSpy).toHaveBeenCalledTimes(1)
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
    await expect(
      nodeA.wallet.getBalance(accountA, Asset.nativeIdentifier()),
    ).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })

    // This transaction will be invalid after the reorg
    const invalidTx = await useTxFixture(nodeA.wallet, accountA, accountB)
    expect(broadcastSpy).toHaveBeenCalledTimes(0)

    await nodeA.wallet.updateHead()
    await expect(
      nodeA.wallet.getBalance(accountA, Asset.nativeIdentifier()),
    ).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
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
    await expect(
      nodeA.wallet.getBalance(accountA, Asset.nativeIdentifier()),
    ).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // Check that it was last broadcast at its added height
    let invalidTxEntry = await accountA.getTransaction(invalidTx.hash())
    expect(invalidTxEntry?.submittedSequence).toEqual(blockA1.header.sequence)

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

  it('should update sequenceToNoteHash for notes created on a fork', async () => {
    const { node: nodeA } = await nodeTest.createSetup()
    const { node: nodeB } = await nodeTest.createSetup()

    const accountA = await useAccountFixture(nodeA.wallet, 'a')
    const accountB = await useAccountFixture(nodeA.wallet, 'b')

    const blockA1 = await useMinerBlockFixture(nodeA.chain, undefined, accountA, nodeA.wallet)
    await expect(nodeA.chain).toAddBlock(blockA1)
    await nodeA.wallet.updateHead()

    const blockB1 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
    await expect(nodeB.chain).toAddBlock(blockB1)
    const blockB2 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
    await expect(nodeB.chain).toAddBlock(blockB2)
    const blockB3 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
    await expect(nodeB.chain).toAddBlock(blockB3)

    // Notes from this transaction will not be on chain after the reorg
    const { block: blockA2 } = await useBlockWithTx(nodeA, accountA, accountB, false)
    await expect(nodeA.chain).toAddBlock(blockA2)
    await nodeA.wallet.updateHead()

    // re-org
    await expect(nodeA.chain).toAddBlock(blockB1)
    await expect(nodeA.chain).toAddBlock(blockB2)
    await expect(nodeA.chain).toAddBlock(blockB3)
    expect(nodeA.chain.head.hash.equals(blockB3.header.hash)).toBe(true)

    await nodeA.wallet.updateHead()

    const notesOnChainA = await AsyncUtils.materialize(
      accountA['walletDb'].loadNotesInSequenceRange(accountA, 0, nodeB.chain.head.sequence),
    )
    const notesNotOnChainA = await AsyncUtils.materialize(
      accountA['walletDb'].loadNotesNotOnChain(accountA),
    )
    // set minimumBlockConfirmations so that balance considers confirmations
    const balanceA = await nodeA.wallet.getBalance(accountA, Asset.nativeIdentifier(), {
      minimumBlockConfirmations: 2,
    })

    expect(balanceA.confirmed).toBeGreaterThanOrEqual(0n)
    expect(notesOnChainA.length).toEqual(0)
    expect(notesNotOnChainA.length).toEqual(2)
    expect(balanceA.confirmed).toBeGreaterThanOrEqual(0n)
  })

  it('should update balances for expired transactions with spends on a fork', async () => {
    const { node: nodeA } = await nodeTest.createSetup()
    const { node: nodeB } = await nodeTest.createSetup()

    const accountA = await useAccountFixture(nodeA.wallet, 'a')
    const accountB = await useAccountFixture(nodeA.wallet, 'b')

    const blockA1 = await useMinerBlockFixture(nodeA.chain, undefined, accountA, nodeA.wallet)
    await expect(nodeA.chain).toAddBlock(blockA1)
    await nodeA.wallet.updateHead()

    const blockB1 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
    await expect(nodeB.chain).toAddBlock(blockB1)
    const blockB2 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
    await expect(nodeB.chain).toAddBlock(blockB2)
    const blockB3 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
    await expect(nodeB.chain).toAddBlock(blockB3)

    // This transaction will be invalid after the reorg
    const { block: blockA2, transaction: forkTx } = await useBlockWithTx(
      nodeA,
      accountA,
      accountB,
      false,
    )
    await expect(nodeA.chain).toAddBlock(blockA2)
    await nodeA.wallet.updateHead()

    await expect(
      nodeA.wallet.getBalance(accountA, Asset.nativeIdentifier()),
    ).resolves.toMatchObject({
      confirmed: BigInt(1999999998),
      unconfirmed: BigInt(1999999998),
    })

    // Create a transaction that spends notes from the invalid transaction
    const forkSpendTx = await useTxFixture(nodeA.wallet, accountA, accountB)

    // re-org
    await expect(nodeA.chain).toAddBlock(blockB1)
    await expect(nodeA.chain).toAddBlock(blockB2)
    await expect(nodeA.chain).toAddBlock(blockB3)
    expect(nodeA.chain.head.hash.equals(blockB3.header.hash)).toBe(true)
    await nodeA.wallet.updateHead()

    await expect(
      nodeA.wallet.getBalance(accountA, Asset.nativeIdentifier()),
    ).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // expire original transaction from fork
    await accountA.expireTransaction(forkTx)

    await expect(
      nodeA.wallet.getBalance(accountA, Asset.nativeIdentifier()),
    ).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // expire transaction that spends from fork
    await accountA.expireTransaction(forkSpendTx)

    await expect(
      nodeA.wallet.getBalance(accountA, Asset.nativeIdentifier()),
    ).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })
  })

  it('should update nullifiers for notes created on a fork', async () => {
    const { node: nodeA } = await nodeTest.createSetup()
    const { node: nodeB } = await nodeTest.createSetup()

    const accountA = await useAccountFixture(nodeA.wallet, 'a')
    const accountB = await useAccountFixture(nodeA.wallet, 'b')

    const blockA1 = await useMinerBlockFixture(nodeA.chain, undefined, accountA, nodeA.wallet)
    await expect(nodeA.chain).toAddBlock(blockA1)
    await nodeA.wallet.updateHead()

    const blockB1 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
    await expect(nodeB.chain).toAddBlock(blockB1)
    const blockB2 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
    await expect(nodeB.chain).toAddBlock(blockB2)
    const blockB3 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
    await expect(nodeB.chain).toAddBlock(blockB3)

    // This transaction will be invalid after the reorg
    const { block: blockA2 } = await useBlockWithTx(nodeA, accountA, accountB, false)
    await expect(nodeA.chain).toAddBlock(blockA2)
    await nodeA.wallet.updateHead()

    // Create a transaction that spends notes from the invalid transaction
    const forkSpendTx = await useTxFixture(nodeA.wallet, accountA, accountB)

    expect(forkSpendTx.spends.length).toEqual(1)

    const forkSpendNullifier = forkSpendTx.spends[0].nullifier
    const forkSpendNoteHash = await accountA.getNoteHash(forkSpendNullifier)

    // nullifier should be non-null
    Assert.isNotNull(forkSpendNoteHash)

    // re-org
    await expect(nodeA.chain).toAddBlock(blockB1)
    await expect(nodeA.chain).toAddBlock(blockB2)
    await expect(nodeA.chain).toAddBlock(blockB3)
    expect(nodeA.chain.head.hash.equals(blockB3.header.hash)).toBe(true)
    await nodeA.wallet.updateHead()

    const forkSpendNote = await accountA.getDecryptedNote(forkSpendNoteHash)
    expect(forkSpendNote).toBeDefined()
    expect(forkSpendNote?.nullifier).toBeNull()

    // nullifier should have been removed from nullifierToNote
    expect(await accountA.getNoteHash(forkSpendNullifier)).toBeNull()
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

      // create a second account and import it so that its head hash is null
      const { node: nodeB } = await nodeTest.createSetup()
      const toImport = await useAccountFixture(nodeB.wallet, 'accountB')

      const accountB = await node.wallet.importAccount(toImport)

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

      expect(await nodeA.wallet.getBalance(accountA, Asset.nativeIdentifier())).toMatchObject({
        confirmed: BigInt(6000000000),
        unconfirmed: BigInt(10000000000),
      })
      expect(await nodeB.wallet.getBalance(accountB, Asset.nativeIdentifier())).toMatchObject({
        confirmed: BigInt(0),
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

      // create a second account and import it so that its head hash is null
      const { node: nodeB } = await nodeTest.createSetup()
      const toImport = await useAccountFixture(nodeB.wallet, 'accountB')
      const accountB = await node.wallet.importAccount(toImport)

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

      await expect(node.wallet.importAccount(account)).rejects.toThrow(
        'Account already exists with the name',
      )
    })

    it('should not import accounts with duplicate keys', async () => {
      const { node } = nodeTest

      const account = await useAccountFixture(node.wallet, 'accountA')

      expect(node.wallet.accountExists(account.name)).toEqual(true)

      const clone = { ...account }
      clone.name = 'Different name'

      await expect(node.wallet.importAccount(clone)).rejects.toThrow(
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

      const block2 = await useMinerBlockFixture(node.chain, 2, accountA, node.wallet)
      await node.chain.addBlock(block2)

      await node.wallet.updateHead()

      const tx = await useTxFixture(node.wallet, accountA, accountB, undefined, undefined, 3)

      const block3 = await useMinerBlockFixture(node.chain, 3, accountA, node.wallet)
      await node.chain.addBlock(block3)

      await accountA.getTransaction(tx.hash())

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

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)

      await node.wallet.updateHead()

      const transaction = await useTxFixture(
        node.wallet,
        accountA,
        accountB,
        undefined,
        undefined,
        3,
      )

      const block3 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block3)

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

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.updateHead()

      // create expired transaction
      const transaction = await useTxFixture(
        node.wallet,
        accountA,
        accountA,
        undefined,
        undefined,
        3,
      )

      const block3 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block3)
      await node.wallet.updateHead()

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

  describe('syncTransaction', () => {
    it('should not re-sync expired transactions', async () => {
      const { node: nodeA } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(nodeA.wallet, 'a')
      const accountB = await useAccountFixture(nodeA.wallet, 'b')

      const blockA2 = await useMinerBlockFixture(nodeA.chain, 2, accountA, nodeA.wallet)
      await expect(nodeA.chain).toAddBlock(blockA2)
      await nodeA.wallet.updateHead()

      // Create a transaction that will expire
      const tx = await useTxFixture(nodeA.wallet, accountA, accountB, undefined, undefined, 3)

      await expect(
        nodeA.wallet.getBalance(accountA, Asset.nativeIdentifier()),
      ).resolves.toMatchObject({
        confirmed: BigInt(2000000000),
        unconfirmed: BigInt(2000000000),
      })

      // Mine a new block at sequence 3, expiring transaction
      const blockA3 = await useMinerBlockFixture(nodeA.chain, 3, accountB, nodeA.wallet)
      await expect(nodeA.chain).toAddBlock(blockA3)
      expect(nodeA.chain.head.hash.equals(blockA3.header.hash)).toBe(true)

      await nodeA.wallet.updateHead()

      await accountA.expireTransaction(tx)

      // none of the transaction's notes are in accountA's wallet
      for (const note of tx.notes) {
        await expect(accountA.getDecryptedNote(note.merkleHash())).resolves.toBeUndefined()
      }

      await expect(
        nodeA.wallet.getBalance(accountA, Asset.nativeIdentifier()),
      ).resolves.toMatchObject({
        unconfirmed: BigInt(2000000000), // minersFee from blockA1
      })

      // re-sync expired transaction
      await nodeA.wallet.syncTransaction(tx, {})

      // none of the expired transaction's notes should be in accountA's wallet
      for (const note of tx.notes) {
        await expect(accountA.getDecryptedNote(note.merkleHash())).resolves.toBeUndefined()
      }

      // balance should not have changed
      await expect(
        nodeA.wallet.getBalance(accountA, Asset.nativeIdentifier()),
      ).resolves.toMatchObject({
        unconfirmed: BigInt(2000000000), // minersFee from blockA1
      })
    })

    it('should re-sync expired transactions if they were added on blocks', async () => {
      const { node: nodeA } = await nodeTest.createSetup()
      const { node: nodeB } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(nodeA.wallet, 'a')
      const accountB = await useAccountFixture(nodeA.wallet, 'b')

      const blockA2 = await useMinerBlockFixture(nodeA.chain, 2, accountA, nodeA.wallet)
      await expect(nodeA.chain).toAddBlock(blockA2)
      await expect(nodeB.chain).toAddBlock(blockA2)
      await nodeA.wallet.updateHead()

      // Create a transaction that will expire
      const tx = await useTxFixture(nodeA.wallet, accountA, accountB, undefined, undefined, 4)

      await expect(
        nodeA.wallet.getBalance(accountA, Asset.nativeIdentifier()),
      ).resolves.toMatchObject({
        confirmed: BigInt(2000000000),
        unconfirmed: BigInt(2000000000),
      })

      // Mine a new block at sequence 3, expiring transaction
      const blockA3 = await useMinerBlockFixture(nodeA.chain, 3, accountB, nodeA.wallet)
      await expect(nodeA.chain).toAddBlock(blockA3)
      expect(nodeA.chain.head.hash.equals(blockA3.header.hash)).toBe(true)

      await nodeA.wallet.updateHead()

      await accountA.expireTransaction(tx)

      // none of the transaction's notes are in accountA's wallet
      for (const note of tx.notes) {
        await expect(accountA.getDecryptedNote(note.merkleHash())).resolves.toBeUndefined()
      }

      await expect(
        nodeA.wallet.getBalance(accountA, Asset.nativeIdentifier()),
      ).resolves.toMatchObject({
        confirmed: BigInt(2000000000),
        unconfirmed: BigInt(2000000000), // minersFee from blockA1
      })

      // mine the transaction on a fork
      const blockB3 = await useMinerBlockFixture(nodeB.chain, 3, undefined, undefined, [tx])
      await expect(nodeB.chain).toAddBlock(blockB3)
      const blockB4 = await useMinerBlockFixture(nodeB.chain, 4)
      await expect(nodeB.chain).toAddBlock(blockB4)

      // re-org nodeA to the fork, and re-sync the transaction
      await expect(nodeA.chain).toAddBlock(blockB3)
      await expect(nodeA.chain).toAddBlock(blockB4)
      expect(nodeA.chain.head.hash.equals(blockB4.header.hash)).toBe(true)

      await nodeA.wallet.updateHead()

      // balance should include the transaction
      await expect(
        nodeA.wallet.getBalance(accountA, Asset.nativeIdentifier()),
      ).resolves.toMatchObject({
        unconfirmed: BigInt(1999999999), // change from transaction
      })
    })
  })

  describe('createSpendsForAsset', () => {
    it('returns spendable notes for a provided asset identifier', async () => {
      const { node } = await nodeTest.createSetup()
      const account = await useAccountFixture(node.wallet)

      // Get some coins for transaction fees
      const blockA = await useMinerBlockFixture(node.chain, 2, account, node.wallet)
      await expect(node.chain).toAddBlock(blockA)
      await node.wallet.updateHead()

      const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')
      const assetIdentifier = asset.identifier()
      const mintValue = BigInt(10)
      // Mint some coins
      const blockB = await useBlockFixture(node.chain, async () => {
        const raw = await node.wallet.createTransaction(
          account,
          [],
          [{ asset, value: mintValue }],
          [],
          BigInt(0),
          0,
        )

        const transaction = await node.wallet.postTransaction(raw)

        return node.chain.newBlock(
          [transaction],
          await node.strategy.createMinersFee(transaction.fee(), 3, generateKey().spending_key),
        )
      })
      await expect(node.chain).toAddBlock(blockB)
      await node.wallet.updateHead()

      const outputNote = blockB.transactions[1].getNote(0)
      const note = outputNote.decryptNoteForOwner(account.incomingViewKey)
      Assert.isNotUndefined(note)

      // Check what notes would be spent
      const { amount, notes } = await node.wallet.createSpendsForAsset(
        account,
        assetIdentifier,
        BigInt(2),
      )
      expect(amount).toEqual(mintValue)
      expect(notes).toHaveLength(1)
      expect(notes[0].note).toMatchObject(note)
    })
  })

  describe('addPendingTransaction', () => {
    it('should add transactions to accounts involved in the transaction', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')
      const accountB = await useAccountFixture(node.wallet, 'b')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.updateHead()

      const addSpyA = jest.spyOn(accountA, 'addPendingTransaction')
      const addSpyB = jest.spyOn(accountB, 'addPendingTransaction')

      await useTxFixture(node.wallet, accountA, accountA)

      // tx added to accountA
      expect(addSpyA).toHaveBeenCalledTimes(1)

      // tx not added to accountB
      expect(addSpyB).toHaveBeenCalledTimes(0)
    })

    it('should not decrypt notes for accounts that have already seen the transaction', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')
      const accountB = await useAccountFixture(node.wallet, 'b')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.updateHead()

      const decryptSpy = jest.spyOn(node.wallet, 'decryptNotes')

      const tx = await useTxFixture(node.wallet, accountA, accountB)

      expect(decryptSpy).toHaveBeenCalledTimes(1)
      expect(decryptSpy).toHaveBeenLastCalledWith(tx, null, [accountA, accountB])

      await node.wallet.addPendingTransaction(tx)

      // notes should not have been decrypted again
      expect(decryptSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('connectBlock', () => {
    it('should add transactions to the walletDb with blockHash and sequence set', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')
      const accountB = await useAccountFixture(node.wallet, 'b')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.updateHead()

      const { block: blockA2, transaction } = await useBlockWithTx(node, accountA, accountB)
      await expect(node.chain).toAddBlock(blockA2)

      await node.wallet.connectBlock(blockA2.header, [accountA, accountB])

      const transactionValue = await accountA.getTransaction(transaction.hash())

      expect(transactionValue).toBeDefined()
      expect(transactionValue?.blockHash).toEqualHash(blockA2.header.hash)
      expect(transactionValue?.sequence).toEqual(blockA2.header.sequence)
    })

    it('should update the account head hash', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')
      const accountB = await useAccountFixture(node.wallet, 'b')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.updateHead()

      const { block: blockA2 } = await useBlockWithTx(node, accountA, accountB)
      await expect(node.chain).toAddBlock(blockA2)

      await node.wallet.connectBlock(blockA2.header, [accountA, accountB])

      const accountAHeadHash = await accountA.getHeadHash()

      expect(accountAHeadHash).toEqualHash(blockA2.header.hash)
    })

    it('should update the account unconfirmed balance', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')
      const accountB = await useAccountFixture(node.wallet, 'b')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.updateHead()

      const balanceBefore = await accountA.getUnconfirmedBalance(Asset.nativeIdentifier())
      expect(balanceBefore).toEqual(2000000000n)

      const { block: blockA2 } = await useBlockWithTx(node, accountA, accountB, false)
      await expect(node.chain).toAddBlock(blockA2)

      await node.wallet.connectBlock(blockA2.header, [accountA, accountB])

      const balanceAfter = await accountA.getUnconfirmedBalance(Asset.nativeIdentifier())
      expect(balanceAfter).toEqual(1999999998n)
    })
  })
})
