/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset, generateKey } from '@ironfish/rust-nodejs'
import { BufferMap } from 'buffer-map'
import { v4 as uuid } from 'uuid'
import { Assert } from '../assert'
import { VerificationResultReason } from '../consensus'
import {
  createNodeTest,
  useAccountFixture,
  useBlockFixture,
  useBlockWithTx,
  useBurnBlockFixture,
  useMinerBlockFixture,
  useMinersTxFixture,
  useMintBlockFixture,
  usePostTxFixture,
  useTxFixture,
} from '../testUtilities'
import { AsyncUtils } from '../utils'
import { TransactionStatus, TransactionType } from '../wallet'
import { AssetStatus } from './wallet'

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
    await expect(nodeA.wallet.getBalance(accountA, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })

    // This transaction will be invalid after the reorg
    const invalidTx = await useTxFixture(nodeA.wallet, accountA, accountB)
    expect(broadcastSpy).toHaveBeenCalledTimes(0)

    await nodeA.wallet.updateHead()
    await expect(accountA.hasPendingTransaction(invalidTx.hash())).resolves.toBeTruthy()

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
    await expect(nodeA.wallet.getBalance(accountA, Asset.nativeId())).resolves.toMatchObject({
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
    // set confirmations so that balance considers confirmations
    const balanceA = await nodeA.wallet.getBalance(accountA, Asset.nativeId(), {
      confirmations: 2,
    })

    expect(balanceA.confirmed).toBeGreaterThanOrEqual(0n)
    expect(notesOnChainA.length).toEqual(0)
    expect(notesNotOnChainA.length).toEqual(1)
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

    await expect(nodeA.wallet.getBalance(accountA, Asset.nativeId())).resolves.toMatchObject({
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

    await expect(nodeA.wallet.getBalance(accountA, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // expire original transaction from fork
    await accountA.expireTransaction(forkTx)
    await expect(accountA.hasPendingTransaction(forkTx.hash())).resolves.toBeFalsy()

    // expire transaction that spends from fork
    await accountA.expireTransaction(forkSpendTx)
    await expect(accountA.hasPendingTransaction(forkSpendTx.hash())).resolves.toBeFalsy()
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

      await expect(accountA.getHead()).resolves.toEqual({
        hash: block1.header.hash,
        sequence: block1.header.sequence,
      })
      await expect(accountB.getHead()).resolves.toEqual(null)

      await node.wallet.updateHead()

      // Confirm pre-rescan state
      await expect(accountA.getHead()).resolves.toEqual({
        hash: block2.header.hash,
        sequence: block2.header.sequence,
      })
      await expect(accountB.getHead()).resolves.toEqual(null)

      await node.wallet.scanTransactions()

      await expect(accountA.getHead()).resolves.toEqual({
        hash: block2.header.hash,
        sequence: block2.header.sequence,
      })
      await expect(accountB.getHead()).resolves.toEqual({
        hash: block2.header.hash,
        sequence: block2.header.sequence,
      })
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

    it('should not scan if all accounts are up to date', async () => {
      const { chain, wallet } = nodeTest

      const accountA = await useAccountFixture(wallet, 'accountA')
      const accountB = await useAccountFixture(wallet, 'accountB')

      const block1 = await useMinerBlockFixture(chain)
      await expect(chain).toAddBlock(block1)

      await wallet.updateHead()
      expect(wallet['chainProcessor']['hash']?.equals(block1.header.hash)).toBe(true)

      await expect(accountA.getHead()).resolves.toEqual({
        hash: block1.header.hash,
        sequence: block1.header.sequence,
      })
      await expect(accountB.getHead()).resolves.toEqual({
        hash: block1.header.hash,
        sequence: block1.header.sequence,
      })

      const connectSpy = jest.spyOn(wallet, 'connectBlock')

      await expect(wallet.shouldRescan()).resolves.toBe(false)

      await wallet.scanTransactions()

      expect(connectSpy).not.toHaveBeenCalled()
    })
  })

  describe('getBalances', () => {
    it('returns balances for all unspent notes across assets for an account', async () => {
      const { node } = await nodeTest.createSetup()
      const account = await useAccountFixture(node.wallet)

      const mined = await useMinerBlockFixture(node.chain, 2, account)
      await expect(node.chain).toAddBlock(mined)
      await node.wallet.updateHead()

      const asset = new Asset(account.spendingKey, 'fakeasset', 'metadata')
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

      const balances = new BufferMap<{
        confirmed: bigint
        unconfirmed: bigint
        unconfirmedCount: number
      }>()
      for await (const {
        assetId,
        confirmed,
        unconfirmed,
        unconfirmedCount,
      } of node.wallet.getBalances(account)) {
        balances.set(assetId, { confirmed, unconfirmed, unconfirmedCount })
      }

      expect(balances.get(Asset.nativeId())).toEqual({
        confirmed: BigInt(2000000000),
        unconfirmed: BigInt(2000000000),
        unconfirmedCount: 0,
      })
      expect(balances.get(asset.id())).toEqual({
        confirmed: BigInt(10),
        unconfirmed: BigInt(10),
        unconfirmedCount: 0,
      })
    })
  })

  describe('getBalance', () => {
    it('returns balances for unspent notes with minimum confirmations on the main chain', async () => {
      const { node: nodeA } = await nodeTest.createSetup({
        config: { confirmations: 2 },
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

      expect(await nodeA.wallet.getBalance(accountA, Asset.nativeId())).toMatchObject({
        confirmed: BigInt(6000000000),
        unconfirmed: BigInt(10000000000),
      })
      expect(await nodeB.wallet.getBalance(accountB, Asset.nativeId())).toMatchObject({
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

      await accountA.updateHead(blockA.header)
      await accountB.updateHead(blockB.header)
      await accountC.updateHead(null)

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

      await accountA.updateHead(blockA.header)
      await accountB.updateHead(blockB.header)
      await accountC.updateHead(null)

      expect(await node.wallet.getLatestHeadHash()).toEqual(blockB.header.hash)
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

    it('should be able to import an account from solely its view keys', async () => {
      const { node } = nodeTest
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { spendingKey, ...key } = generateKey()
      const accountValue = {
        id: uuid(),
        name: 'viewonly',
        version: 1,
        spendingKey: null,
        ...key,
      }
      const viewonlyAccount = await node.wallet.importAccount(accountValue)
      expect(viewonlyAccount.name).toEqual(accountValue.name)
      expect(viewonlyAccount.viewKey).toEqual(key.viewKey)
      expect(viewonlyAccount.incomingViewKey).toEqual(key.incomingViewKey)
      expect(viewonlyAccount.outgoingViewKey).toEqual(key.outgoingViewKey)
      expect(viewonlyAccount.spendingKey).toBeNull()
      expect(viewonlyAccount.publicAddress).toEqual(key.publicAddress)
    })
    it('should be unable to import a viewonly account if it is a dupe', async () => {
      const { node } = nodeTest
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { spendingKey, ...key } = generateKey()
      const accountValue = {
        id: uuid(),
        name: 'viewonly',
        version: 1,
        spendingKey: null,
        ...key,
      }
      await node.wallet.importAccount(accountValue)
      const clone = { ...accountValue }
      clone.name = 'Different name'

      await expect(node.wallet.importAccount(clone)).rejects.toThrow(
        'Account already exists with provided view key(s)',
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
      await node.wallet.addPendingTransaction(tx)

      await expect(
        node.wallet.walletDb.loadTransaction(account, tx.hash()),
      ).resolves.not.toBeNull()

      expect(node.wallet.getAccountByName(account.name)).toMatchObject({
        id: account.id,
      })

      await node.wallet.removeAccountByName(account.name)

      expect(node.wallet.getAccountByName(account.name)).toBeNull()

      // It should not be cleaned yet
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

  describe('createTransaction', () => {
    it('should throw error if fee and fee rate are empty', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'a')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)

      await node.wallet.updateHead()

      const transaction = blockA1.minersFee

      const transactionValue = await accountA.getTransaction(transaction.hash())
      Assert.isNotUndefined(transactionValue)
      Assert.isNotNull(transactionValue.sequence)

      const rawTransaction = node.wallet.createTransaction({
        account: accountA,
        outputs: [
          {
            publicAddress: '0d804ea639b2547d1cd612682bf99f7cad7aad6d59fd5457f61272defcd4bf5b',
            amount: 10n,
            memo: '',
            assetId: Asset.nativeId(),
          },
        ],
        expiration: 0,
      })

      await expect(rawTransaction).rejects.toThrow(
        'Fee or FeeRate is required to create a transaction',
      )
    })

    it('should create raw transaction with fee rate', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'a')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)

      await node.wallet.updateHead()

      const transaction = blockA1.minersFee

      const transactionValue = await accountA.getTransaction(transaction.hash())
      Assert.isNotUndefined(transactionValue)
      Assert.isNotNull(transactionValue.sequence)

      const rawTransaction = await node.wallet.createTransaction({
        account: accountA,
        outputs: [
          {
            publicAddress: '0d804ea639b2547d1cd612682bf99f7cad7aad6d59fd5457f61272defcd4bf5b',
            amount: 10n,
            memo: '',
            assetId: Asset.nativeId(),
          },
        ],
        expiration: 0,
        feeRate: 200n,
      })

      expect(rawTransaction.outputs.length).toBe(1)
      expect(rawTransaction.expiration).toBeDefined()
      expect(rawTransaction.burns.length).toBe(0)
      expect(rawTransaction.mints.length).toBe(0)
      expect(rawTransaction.spends.length).toBe(1)
      expect(rawTransaction.fee).toBeGreaterThan(0n)
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

      await nodeTest.wallet.walletDb.saveHead(accountA, null)

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

  describe('mint', () => {
    describe('for an identifier not stored in the database', () => {
      it('throws a not found exception', async () => {
        const { node } = await nodeTest.createSetup()
        const account = await useAccountFixture(node.wallet)

        const assetId = Buffer.from('thisisafakeidentifier', 'hex')
        await expect(
          node.wallet.mint(account, {
            assetId,
            fee: BigInt(0),
            expirationDelta: node.config.get('transactionExpirationDelta'),
            value: BigInt(1),
          }),
        ).rejects.toThrow(
          `Asset not found. Cannot mint for identifier '${assetId.toString('hex')}'`,
        )
      })
    })

    describe('for a valid asset identifier', () => {
      it('adds balance for the asset from the wallet', async () => {
        const { node } = await nodeTest.createSetup()
        const account = await useAccountFixture(node.wallet)

        const mined = await useMinerBlockFixture(node.chain, 2, account)
        await expect(node.chain).toAddBlock(mined)
        await node.wallet.updateHead()

        const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')

        const mintValueA = BigInt(2)
        const mintBlockA = await useMintBlockFixture({
          node,
          account,
          asset,
          value: mintValueA,
          sequence: 3,
        })
        await expect(node.chain).toAddBlock(mintBlockA)
        await node.wallet.updateHead()

        const mintValueB = BigInt(10)
        const transaction = await useTxFixture(node.wallet, account, account, () => {
          return node.wallet.mint(account, {
            assetId: asset.id(),
            fee: BigInt(0),
            expirationDelta: node.config.get('transactionExpirationDelta'),
            value: mintValueB,
          })
        })

        const mintBlock = await node.chain.newBlock(
          [transaction],
          await node.strategy.createMinersFee(transaction.fee(), 4, generateKey().spendingKey),
        )
        await expect(node.chain).toAddBlock(mintBlock)
        await node.wallet.updateHead()

        expect(await node.wallet.getBalance(account, asset.id())).toMatchObject({
          unconfirmed: BigInt(mintValueA + mintValueB),
          unconfirmedCount: 0,
          confirmed: BigInt(mintValueA + mintValueB),
        })
      })
    })

    describe('for a valid metadata and name', () => {
      it('returns a transaction with matching mint descriptions', async () => {
        const { node } = await nodeTest.createSetup()
        const account = await useAccountFixture(node.wallet)

        const mined = await useMinerBlockFixture(node.chain, 2, account)
        await expect(node.chain).toAddBlock(mined)
        await node.wallet.updateHead()

        const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')
        const mintValue = BigInt(10)
        const mintData = {
          name: asset.name().toString('utf8'),
          metadata: asset.metadata().toString('utf8'),
          value: mintValue,
          isNewAsset: true,
        }

        const transaction = await usePostTxFixture({
          node: node,
          wallet: node.wallet,
          from: account,
          mints: [mintData],
        })

        expect(transaction.mints).toEqual([{ asset: asset, value: mintValue }])
      })

      it('adds balance for the asset from the wallet', async () => {
        const { node } = await nodeTest.createSetup()
        const account = await useAccountFixture(node.wallet)

        const mined = await useMinerBlockFixture(node.chain, 2, account)
        await expect(node.chain).toAddBlock(mined)
        await node.wallet.updateHead()

        const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')
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

        expect(await node.wallet.getBalance(account, asset.id())).toMatchObject({
          unconfirmed: BigInt(value),
          unconfirmedCount: 0,
          confirmed: BigInt(value),
        })
      })
    })
  })

  describe('burn', () => {
    it('returns a transaction with matching burn descriptions', async () => {
      const { node } = await nodeTest.createSetup()
      const account = await useAccountFixture(node.wallet)

      const mined = await useMinerBlockFixture(node.chain, 2, account)
      await expect(node.chain).toAddBlock(mined)
      await node.wallet.updateHead()

      const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')
      const value = BigInt(10)
      const mintBlock = await useMintBlockFixture({ node, account, asset, value, sequence: 3 })
      await expect(node.chain).toAddBlock(mintBlock)
      await node.wallet.updateHead()

      const burnValue = BigInt(2)
      const transaction = await usePostTxFixture({
        node: node,
        wallet: node.wallet,
        from: account,
        burns: [{ assetId: asset.id(), value: burnValue }],
      })

      expect(transaction.burns).toEqual([{ assetId: asset.id(), value: burnValue }])
    })

    it('subtracts balance for the asset from the wallet', async () => {
      const { node } = await nodeTest.createSetup()
      const account = await useAccountFixture(node.wallet)

      const mined = await useMinerBlockFixture(node.chain, 2, account)
      await expect(node.chain).toAddBlock(mined)
      await node.wallet.updateHead()

      const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')
      const value = BigInt(10)
      const mintBlock = await useMintBlockFixture({ node, account, asset, value, sequence: 3 })
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

      expect(await node.wallet.getBalance(account, asset.id())).toMatchObject({
        unconfirmed: BigInt(8),
        unconfirmedCount: 0,
        confirmed: BigInt(8),
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
      const assetId = asset.id()
      const mintValue = BigInt(10)
      const mintData = {
        name: asset.name().toString('utf8'),
        metadata: asset.metadata().toString('utf8'),
        value: mintValue,
        isNewAsset: true,
      }

      // Mint some coins
      const blockB = await useBlockFixture(node.chain, async () => {
        const raw = await node.wallet.createTransaction({
          account,
          mints: [mintData],
          fee: 0n,
          expiration: 0,
        })

        const transaction = await node.wallet.post({
          transaction: raw,
          account,
        })

        return node.chain.newBlock(
          [transaction],
          await node.strategy.createMinersFee(transaction.fee(), 3, generateKey().spendingKey),
        )
      })
      await expect(node.chain).toAddBlock(blockB)
      await node.wallet.updateHead()
      await expect(node.wallet.getBalance(account, asset.id())).resolves.toMatchObject({
        confirmed: mintValue,
      })

      expect(blockB.transactions[1].notes.length).toBe(2)
      // TODO(mat): This test is flaky. The order of notes may change, so if
      // this is failing, change this to `getNote(1)`. There's a ticket to
      // resolve this, but trying to focus on phase 3 first.
      const outputNote = blockB.transactions[1].getNote(0)
      const note = outputNote.decryptNoteForOwner(account.incomingViewKey)
      Assert.isNotUndefined(note)

      // Check what notes would be spent
      const { amount, notes } = await node.wallet.createSpendsForAsset(
        account,
        assetId,
        BigInt(2),
        0,
      )

      expect(amount).toEqual(mintValue)
      expect(notes).toHaveLength(1)
      expect(notes[0].note).toMatchObject(note)
    })

    it('should return spendable notes dependant on confirmations', async () => {
      const { node } = await nodeTest.createSetup()
      const account = await useAccountFixture(node.wallet)

      const mined = await useMinerBlockFixture(node.chain, 2, account)
      await expect(node.chain).toAddBlock(mined)
      await node.wallet.updateHead()

      const value = BigInt(10)
      const assetId = Asset.nativeId()

      const invalidConfirmations = 100
      const validConfirmations = 0

      const { amount: validAmount, notes: validNotes } = await node.wallet.createSpendsForAsset(
        account,
        assetId,
        value,
        validConfirmations,
      )
      expect(validAmount).toEqual(2000000000n)
      expect(validNotes).toHaveLength(1)

      // No notes should be returned
      const { amount: invalidAmount, notes: invalidNotes } =
        await node.wallet.createSpendsForAsset(account, assetId, value, invalidConfirmations)
      expect(invalidAmount).toEqual(BigInt(0))
      expect(invalidNotes).toHaveLength(0)
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
      expect(decryptSpy).toHaveBeenLastCalledWith(tx, null, false, [accountA, accountB])

      await node.wallet.addPendingTransaction(tx)

      // notes should not have been decrypted again
      expect(decryptSpy).toHaveBeenCalledTimes(1)
    })

    it('should add transactions if an account spent a note but did not receive change', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')
      const accountB = await useAccountFixture(node.wallet, 'b')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.updateHead()

      const { unconfirmed } = await accountA.getBalance(Asset.nativeId(), 0)

      expect(unconfirmed).toEqual(2000000000n)

      // send a transaction that spends all of accountA's balance
      const tx = await useTxFixture(
        node.wallet,
        accountA,
        accountB,
        undefined,
        unconfirmed - 1n,
      )

      await node.wallet.addPendingTransaction(tx)

      await expect(accountA.hasTransaction(tx.hash())).resolves.toBe(true)
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

      await node.wallet.connectBlock(blockA2.header)

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

      await node.wallet.connectBlock(blockA2.header)

      const accountAHead = await accountA.getHead()

      expect(accountAHead?.hash).toEqualHash(blockA2.header.hash)
    })

    it('should update the account unconfirmed balance', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')
      const accountB = await useAccountFixture(node.wallet, 'b')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.updateHead()

      const balanceBefore = await accountA.getUnconfirmedBalance(Asset.nativeId())
      expect(balanceBefore.unconfirmed).toEqual(2000000000n)

      const { block: blockA2 } = await useBlockWithTx(node, accountA, accountB, false)
      await expect(node.chain).toAddBlock(blockA2)

      await node.wallet.connectBlock(blockA2.header)

      const balanceAfter = await accountA.getUnconfirmedBalance(Asset.nativeId())
      expect(balanceAfter.unconfirmed).toEqual(1999999998n)
    })

    it('should not connect blocks behind the account head', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.updateHead()

      const blockA2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA2)

      await node.wallet.connectBlock(blockA2.header)

      let accountAHead = await accountA.getHead()
      expect(accountAHead?.hash).toEqualHash(blockA2.header.hash)

      // Try to connect A1 again
      await node.wallet.connectBlock(blockA1.header)

      // accountA head hash should be unchanged
      accountAHead = await accountA.getHead()
      expect(accountAHead?.hash).toEqualHash(blockA2.header.hash)
    })

    it('should not connect blocks equal to the account head', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.updateHead()

      const blockA2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA2)

      await node.wallet.connectBlock(blockA2.header)

      let accountAHead = await accountA.getHead()
      expect(accountAHead?.hash).toEqualHash(blockA2.header.hash)

      const updateHeadSpy = jest.spyOn(accountA, 'updateHead')

      // Try to connect A2 again
      await node.wallet.connectBlock(blockA1.header)

      expect(updateHeadSpy).not.toHaveBeenCalled()

      accountAHead = await accountA.getHead()
      expect(accountAHead?.hash).toEqualHash(blockA2.header.hash)
    })

    it('should not connect blocks more than one block ahead of the account head', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.updateHead()

      const blockA2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA2)
      const blockA3 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA3)

      let accountAHead = await accountA.getHead()
      expect(accountAHead?.hash).toEqualHash(blockA1.header.hash)

      const updateHeadSpy = jest.spyOn(accountA, 'updateHead')

      // Try to connect A3
      await node.wallet.connectBlock(blockA3.header)

      expect(updateHeadSpy).not.toHaveBeenCalled()

      accountAHead = await accountA.getHead()
      expect(accountAHead?.hash).toEqualHash(blockA1.header.hash)
    })

    it('should update balance hash and sequence for each block', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')
      const accountB = await useAccountFixture(node.wallet, 'b')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.updateHead()

      await expect(accountA.getUnconfirmedBalance(Asset.nativeId())).resolves.toMatchObject({
        blockHash: blockA1.header.hash,
        sequence: blockA1.header.sequence,
        unconfirmed: 2000000000n,
      })
      await expect(accountB.getUnconfirmedBalance(Asset.nativeId())).resolves.toMatchObject({
        blockHash: blockA1.header.hash,
        sequence: blockA1.header.sequence,
        unconfirmed: 0n,
      })

      const blockA2 = await useMinerBlockFixture(node.chain, undefined, accountB, node.wallet)
      await expect(node.chain).toAddBlock(blockA2)
      await node.wallet.updateHead()

      await expect(accountA.getUnconfirmedBalance(Asset.nativeId())).resolves.toMatchObject({
        blockHash: blockA2.header.hash,
        sequence: blockA2.header.sequence,
        unconfirmed: 2000000000n,
      })
      await expect(accountB.getUnconfirmedBalance(Asset.nativeId())).resolves.toMatchObject({
        blockHash: blockA2.header.hash,
        sequence: blockA2.header.sequence,
        unconfirmed: 2000000000n,
      })
    })

    it('should update balance hash and sequence for each asset in each block', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.updateHead()

      await expect(accountA.getUnconfirmedBalance(Asset.nativeId())).resolves.toMatchObject({
        blockHash: blockA1.header.hash,
        sequence: blockA1.header.sequence,
        unconfirmed: 2000000000n,
      })

      const asset = new Asset(accountA.spendingKey, 'fakeasset', 'metadata')
      const value = BigInt(10)
      const mintBlock = await useMintBlockFixture({
        node,
        account: accountA,
        asset,
        value,
        sequence: 3,
      })
      await expect(node.chain).toAddBlock(mintBlock)
      await node.wallet.updateHead()

      await expect(accountA.getUnconfirmedBalance(Asset.nativeId())).resolves.toMatchObject({
        blockHash: mintBlock.header.hash,
        sequence: mintBlock.header.sequence,
        unconfirmed: 2000000000n,
      })
      await expect(accountA.getUnconfirmedBalance(asset.id())).resolves.toMatchObject({
        blockHash: mintBlock.header.hash,
        sequence: mintBlock.header.sequence,
        unconfirmed: value,
      })

      const blockA3 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA3)
      await node.wallet.updateHead()

      await expect(accountA.getUnconfirmedBalance(Asset.nativeId())).resolves.toMatchObject({
        blockHash: blockA3.header.hash,
        sequence: blockA3.header.sequence,
        unconfirmed: 4000000000n,
      })
      await expect(accountA.getUnconfirmedBalance(asset.id())).resolves.toMatchObject({
        blockHash: blockA3.header.hash,
        sequence: blockA3.header.sequence,
        unconfirmed: value,
      })
    })

    it('should save assets from the chain the account does not own', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')
      const accountB = await useAccountFixture(node.wallet, 'b')

      const minerBlock = await useMinerBlockFixture(
        node.chain,
        undefined,
        accountA,
        node.wallet,
      )
      await expect(node.chain).toAddBlock(minerBlock)
      await node.wallet.updateHead()

      const asset = new Asset(accountA.spendingKey, 'fakeasset', 'metadata')
      const value = BigInt(10)
      const mintBlock = await useMintBlockFixture({
        node,
        account: accountA,
        asset,
        value,
        sequence: 3,
      })
      await expect(node.chain).toAddBlock(mintBlock)
      await node.wallet.updateHead()

      const transaction = await usePostTxFixture({
        node,
        wallet: node.wallet,
        from: accountA,
        to: accountB,
        assetId: asset.id(),
        amount: BigInt(1n),
      })
      const block = await useMinerBlockFixture(node.chain, undefined, undefined, undefined, [
        transaction,
      ])
      await expect(node.chain).toAddBlock(block)
      await node.wallet.updateHead()

      expect(await accountA['walletDb'].getAsset(accountA, asset.id())).toEqual({
        blockHash: mintBlock.header.hash,
        createdTransactionHash: mintBlock.transactions[1].hash(),
        id: asset.id(),
        metadata: asset.metadata(),
        name: asset.name(),
        owner: Buffer.from(accountA.publicAddress, 'hex'),
        sequence: mintBlock.header.sequence,
        supply: value,
      })
      expect(await accountB['walletDb'].getAsset(accountB, asset.id())).toEqual({
        blockHash: block.header.hash,
        createdTransactionHash: mintBlock.transactions[1].hash(),
        id: asset.id(),
        metadata: asset.metadata(),
        name: asset.name(),
        owner: Buffer.from(accountA.publicAddress, 'hex'),
        sequence: block.header.sequence,
        supply: null,
      })
    })

    it('should add transactions to accounts if the account spends, but does not receive notes', async () => {
      const { node } = await nodeTest.createSetup()
      const { node: node2 } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')
      const accountB = await useAccountFixture(node.wallet, 'b')

      // import accountB to second node not used to create transaction
      const accountAImport = await node2.wallet.importAccount(accountA)

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await expect(node2.chain).toAddBlock(blockA1)
      await node.wallet.updateHead()
      await node2.wallet.updateHead()

      const { unconfirmed } = await accountAImport.getBalance(Asset.nativeId(), 0)

      expect(unconfirmed).toEqual(2000000000n)

      // create transaction spending all of A's balance
      const { block: blockA2, transaction } = await useBlockWithTx(
        node,
        accountA,
        accountB,
        false,
        {
          fee: Number(unconfirmed - 1n),
        },
      )
      await expect(node.chain).toAddBlock(blockA2)
      await expect(node2.chain).toAddBlock(blockA2)
      await node.wallet.updateHead()

      await expect(accountA.hasTransaction(transaction.hash())).resolves.toBe(true)
      await expect(accountAImport.hasTransaction(transaction.hash())).resolves.toBe(false)

      // update node2 so that transaction is connected to imported account
      await node2.wallet.updateHead()

      await expect(accountAImport.hasTransaction(transaction.hash())).resolves.toBe(true)
    })
  })

  describe('getAssetStatus', () => {
    it('should return the correct status for assets', async () => {
      const { node } = await nodeTest.createSetup()
      const account = await useAccountFixture(node.wallet)

      const mined = await useMinerBlockFixture(node.chain, 2, account)
      await expect(node.chain).toAddBlock(mined)
      await node.wallet.updateHead()

      const asset = new Asset(account.spendingKey, 'asset', 'metadata')
      const value = BigInt(10)
      const mintBlock = await useMintBlockFixture({
        node,
        account,
        asset,
        value,
      })

      let assetValue = await node.wallet.walletDb.getAsset(account, asset.id())
      Assert.isNotUndefined(assetValue)

      // Check status before added to a block
      expect(await node.wallet.getAssetStatus(account, assetValue)).toEqual(AssetStatus.PENDING)

      // Add to a block and check different confirmation ranges
      await expect(node.chain).toAddBlock(mintBlock)
      await node.wallet.updateHead()
      assetValue = await node.wallet.walletDb.getAsset(account, asset.id())
      Assert.isNotUndefined(assetValue)
      expect(await node.wallet.getAssetStatus(account, assetValue)).toEqual(
        AssetStatus.CONFIRMED,
      )
      expect(
        await node.wallet.getAssetStatus(account, assetValue, { confirmations: 2 }),
      ).toEqual(AssetStatus.UNCONFIRMED)

      // Remove the head and check status
      jest.spyOn(account, 'getHead').mockResolvedValueOnce(Promise.resolve(null))
      expect(await node.wallet.getAssetStatus(account, assetValue)).toEqual(AssetStatus.UNKNOWN)
    })
  })

  describe('disconnectBlock', () => {
    it('should update transactions in the walletDb with blockHash and sequence null', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')
      const accountB = await useAccountFixture(node.wallet, 'b')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.updateHead()

      const { block: blockA2, transaction } = await useBlockWithTx(node, accountA, accountB)
      await expect(node.chain).toAddBlock(blockA2)

      await node.wallet.updateHead()

      let transactionValue = await accountA.getTransaction(transaction.hash())

      expect(transactionValue).toBeDefined()
      expect(transactionValue?.blockHash).toEqualHash(blockA2.header.hash)
      expect(transactionValue?.sequence).toEqual(blockA2.header.sequence)

      await node.chain.db.transaction(async (tx) => {
        await node.chain.disconnect(blockA2, tx)
      })

      await node.wallet.updateHead()

      transactionValue = await accountA.getTransaction(transaction.hash())

      expect(transactionValue).toBeDefined()
      expect(transactionValue?.blockHash).toBeNull()
      expect(transactionValue?.sequence).toBeNull()
    })

    it('should update the account head hash to the previous block', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')
      const accountB = await useAccountFixture(node.wallet, 'b')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.updateHead()

      const { block: blockA2 } = await useBlockWithTx(node, accountA, accountB)
      await expect(node.chain).toAddBlock(blockA2)

      await node.wallet.updateHead()

      let accountAHead = await accountA.getHead()

      expect(accountAHead?.hash).toEqualHash(blockA2.header.hash)

      await node.chain.db.transaction(async (tx) => {
        await node.chain.disconnect(blockA2, tx)
      })

      await node.wallet.updateHead()

      accountAHead = await accountA.getHead()

      expect(accountAHead?.hash).toEqualHash(blockA2.header.previousBlockHash)
    })

    it('should update the account unconfirmed balance', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')
      const accountB = await useAccountFixture(node.wallet, 'b')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.updateHead()

      const balanceBefore = await accountA.getUnconfirmedBalance(Asset.nativeId())
      expect(balanceBefore.unconfirmed).toEqual(2000000000n)

      const { block: blockA2 } = await useBlockWithTx(node, accountA, accountB, false)
      await expect(node.chain).toAddBlock(blockA2)

      await node.wallet.updateHead()

      const balanceAfterConnect = await accountA.getUnconfirmedBalance(Asset.nativeId())
      expect(balanceAfterConnect.unconfirmed).toEqual(1999999998n)

      await node.chain.db.transaction(async (tx) => {
        await node.chain.disconnect(blockA2, tx)
      })

      await node.wallet.updateHead()

      const balanceAfterDisconnect = await accountA.getUnconfirmedBalance(Asset.nativeId())
      expect(balanceAfterDisconnect.unconfirmed).toEqual(2000000000n)
    })

    it('should not disconnect blocks before the account head', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.updateHead()

      const blockA2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA2)
      await node.wallet.updateHead()

      let accountAHead = await accountA.getHead()
      expect(accountAHead?.hash).toEqualHash(blockA2.header.hash)

      // Try to disconnect blockA1
      await node.wallet.disconnectBlock(blockA1.header)

      // Verify accountA head hash unchanged
      accountAHead = await accountA.getHead()
      expect(accountAHead?.hash).toEqualHash(blockA2.header.hash)
    })

    it('should not disconnect blocks ahead of the account head', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.updateHead()

      const blockA2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)

      let accountAHead = await accountA.getHead()
      expect(accountAHead?.hash).toEqualHash(blockA1.header.hash)

      const updateHeadSpy = jest.spyOn(accountA, 'updateHead')

      // Try to disconnect blockA2
      await node.wallet.disconnectBlock(blockA2.header)

      expect(updateHeadSpy).not.toHaveBeenCalled()

      accountAHead = await accountA.getHead()
      expect(accountAHead?.hash).toEqualHash(blockA1.header.hash)
    })

    it('should remove minersFee transactions', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      const transaction = blockA1.transactions[0]

      Assert.isTrue(transaction.isMinersFee())

      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.updateHead()

      const accountAHead = await accountA.getHead()
      expect(accountAHead?.hash).toEqualHash(blockA1.header.hash)
      await expect(accountA.hasTransaction(transaction.hash())).resolves.toEqual(true)

      // disconnect blockA1
      await node.wallet.disconnectBlock(blockA1.header)

      await expect(accountA.hasTransaction(transaction.hash())).resolves.toEqual(false)
    })

    it('should update balance hash and sequence for each block', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')
      const accountB = await useAccountFixture(node.wallet, 'b')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.updateHead()

      await expect(accountA.getUnconfirmedBalance(Asset.nativeId())).resolves.toMatchObject({
        blockHash: blockA1.header.hash,
        sequence: blockA1.header.sequence,
        unconfirmed: 2000000000n,
      })
      await expect(accountB.getUnconfirmedBalance(Asset.nativeId())).resolves.toMatchObject({
        blockHash: blockA1.header.hash,
        sequence: blockA1.header.sequence,
        unconfirmed: 0n,
      })

      const blockA2 = await useMinerBlockFixture(node.chain, undefined, accountB, node.wallet)
      await expect(node.chain).toAddBlock(blockA2)
      await node.wallet.updateHead()

      await expect(accountA.getUnconfirmedBalance(Asset.nativeId())).resolves.toMatchObject({
        blockHash: blockA2.header.hash,
        sequence: blockA2.header.sequence,
        unconfirmed: 2000000000n,
      })
      await expect(accountB.getUnconfirmedBalance(Asset.nativeId())).resolves.toMatchObject({
        blockHash: blockA2.header.hash,
        sequence: blockA2.header.sequence,
        unconfirmed: 2000000000n,
      })

      await node.wallet.disconnectBlock(blockA2.header)

      await expect(accountA.getUnconfirmedBalance(Asset.nativeId())).resolves.toMatchObject({
        blockHash: blockA1.header.hash,
        sequence: blockA1.header.sequence,
        unconfirmed: 2000000000n,
      })
      await expect(accountB.getUnconfirmedBalance(Asset.nativeId())).resolves.toMatchObject({
        blockHash: blockA1.header.hash,
        sequence: blockA1.header.sequence,
        unconfirmed: 0n,
      })
    })

    it('should update balance hash and sequence for each asset in each block', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.updateHead()

      await expect(accountA.getUnconfirmedBalance(Asset.nativeId())).resolves.toMatchObject({
        blockHash: blockA1.header.hash,
        sequence: blockA1.header.sequence,
        unconfirmed: 2000000000n,
      })

      const asset = new Asset(accountA.spendingKey, 'fakeasset', 'metadata')
      const value = BigInt(10)
      const mintBlock = await useMintBlockFixture({
        node,
        account: accountA,
        asset,
        value,
        sequence: 3,
      })
      await expect(node.chain).toAddBlock(mintBlock)
      await node.wallet.updateHead()

      await expect(accountA.getUnconfirmedBalance(Asset.nativeId())).resolves.toMatchObject({
        blockHash: mintBlock.header.hash,
        sequence: mintBlock.header.sequence,
        unconfirmed: 2000000000n,
      })
      await expect(accountA.getUnconfirmedBalance(asset.id())).resolves.toMatchObject({
        blockHash: mintBlock.header.hash,
        sequence: mintBlock.header.sequence,
        unconfirmed: value,
      })

      const blockA3 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA3)
      await node.wallet.updateHead()

      await expect(accountA.getUnconfirmedBalance(Asset.nativeId())).resolves.toMatchObject({
        blockHash: blockA3.header.hash,
        sequence: blockA3.header.sequence,
        unconfirmed: 4000000000n,
      })
      await expect(accountA.getUnconfirmedBalance(asset.id())).resolves.toMatchObject({
        blockHash: blockA3.header.hash,
        sequence: blockA3.header.sequence,
        unconfirmed: value,
      })

      await node.wallet.disconnectBlock(blockA3.header)

      await expect(accountA.getUnconfirmedBalance(Asset.nativeId())).resolves.toMatchObject({
        blockHash: mintBlock.header.hash,
        sequence: mintBlock.header.sequence,
        unconfirmed: 2000000000n,
      })
      await expect(accountA.getUnconfirmedBalance(asset.id())).resolves.toMatchObject({
        blockHash: mintBlock.header.hash,
        sequence: mintBlock.header.sequence,
        unconfirmed: value,
      })
    })
  })

  describe('resetAccount', () => {
    it('should create a new account with the same keys but different id', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')

      await node.wallet.resetAccount(accountA)

      const newAccountA = node.wallet.getAccountByName('a')

      Assert.isNotNull(newAccountA)

      expect(newAccountA.id).not.toEqual(accountA.id)

      expect(newAccountA.spendingKey).toEqual(accountA.spendingKey)
    })

    it('should set the reset account balance to 0', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')

      await node.wallet.resetAccount(accountA)

      const newAccountA = node.wallet.getAccountByName('a')

      Assert.isNotNull(newAccountA)

      expect(newAccountA.id).not.toEqual(accountA.id)

      await expect(newAccountA.getBalance(Asset.nativeId(), 0)).resolves.toMatchObject({
        confirmed: 0n,
        unconfirmed: 0n,
      })
    })

    it('should set the reset account head to null', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')

      await node.wallet.resetAccount(accountA)

      const newAccountA = node.wallet.getAccountByName('a')

      Assert.isNotNull(newAccountA)

      expect(newAccountA.id).not.toEqual(accountA.id)

      await expect(newAccountA.getHead()).resolves.toBeNull()
    })

    it('should mark the account for deletion', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')

      await node.wallet.resetAccount(accountA)

      await expect(node.wallet.walletDb.accountIdsToCleanup.has(accountA.id)).resolves.toBe(
        true,
      )
    })
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

      await expect(node.wallet.getTransactionType(accountA, transactionValue)).resolves.toEqual(
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

      await expect(node.wallet.getTransactionType(accountA, transactionValue)).resolves.toEqual(
        TransactionType.SEND,
      )
    })

    it('should return send type for mint transactions', async () => {
      const { node } = await nodeTest.createSetup()

      const account = await useAccountFixture(node.wallet, 'a')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.updateHead()

      const asset = new Asset(account.spendingKey, 'fakeasset', 'metadata')
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

      await expect(node.wallet.getTransactionType(account, transactionValue)).resolves.toEqual(
        TransactionType.SEND,
      )
    })

    it('should return send type for burn transactions', async () => {
      const { node } = await nodeTest.createSetup()

      const account = await useAccountFixture(node.wallet, 'a')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.updateHead()

      const asset = new Asset(account.spendingKey, 'fakeasset', 'metadata')
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

      await expect(node.wallet.getTransactionType(account, transactionValue)).resolves.toEqual(
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

      await expect(node.wallet.getTransactionType(accountB, transactionValue)).resolves.toEqual(
        TransactionType.RECEIVE,
      )
    })
  })
})
