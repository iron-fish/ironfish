/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset, generateKey, MEMO_LENGTH, Note as NativeNote } from '@ironfish/rust-nodejs'
import { BufferMap, BufferSet } from 'buffer-map'
import { v4 as uuid } from 'uuid'
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { VerificationResultReason, Verifier } from '../consensus'
import { Note, RawTransaction } from '../primitives'
import { TransactionVersion } from '../primitives/transaction'
import {
  createNodeTest,
  useAccountFixture,
  useBlockWithTx,
  useBurnBlockFixture,
  useMinerBlockFixture,
  useMinersTxFixture,
  useMintBlockFixture,
  usePostTxFixture,
  useTxFixture,
} from '../testUtilities'
import { AsyncUtils, BufferUtils, ORE_TO_IRON } from '../utils'
import { Account, TransactionStatus, TransactionType } from '../wallet'
import { EncryptedAccount } from './account/encryptedAccount'
import {
  AccountDecryptionFailedError,
  DuplicateAccountNameError,
  DuplicateSpendingKeyError,
  MaxMemoLengthError,
  MaxTransactionSizeError,
} from './errors'
import { toAccountImport } from './exporter'
import { AssetStatus, Wallet } from './wallet'
import { DecryptedAccountValue } from './walletdb/accountValue'

describe('Wallet', () => {
  const nodeTest = createNodeTest()

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
    await nodeA.wallet.scan()
    await expect(nodeA.wallet.getBalance(accountA, Asset.nativeId())).resolves.toMatchObject({
      confirmed: BigInt(2000000000),
      unconfirmed: BigInt(2000000000),
    })

    // This transaction will be invalid after the reorg
    const invalidTx = await useTxFixture(nodeA.wallet, accountA, accountB)
    expect(broadcastSpy).toHaveBeenCalledTimes(0)

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

    await nodeA.wallet.scan()
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
    await nodeA.wallet.rebroadcastTransactions(nodeA.chain.head.sequence)

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
    await nodeA.wallet.scan()

    const blockB1 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
    await expect(nodeB.chain).toAddBlock(blockB1)
    const blockB2 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
    await expect(nodeB.chain).toAddBlock(blockB2)
    const blockB3 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
    await expect(nodeB.chain).toAddBlock(blockB3)

    // Notes from this transaction will not be on chain after the reorg
    const { block: blockA2 } = await useBlockWithTx(nodeA, accountA, accountB, false)
    await expect(nodeA.chain).toAddBlock(blockA2)
    await nodeA.wallet.scan()

    // re-org
    await expect(nodeA.chain).toAddBlock(blockB1)
    await expect(nodeA.chain).toAddBlock(blockB2)
    await expect(nodeA.chain).toAddBlock(blockB3)
    expect(nodeA.chain.head.hash.equals(blockB3.header.hash)).toBe(true)

    await nodeA.wallet.scan()

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
    await nodeA.wallet.scan()

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
    await nodeA.wallet.scan()

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
    await nodeA.wallet.scan()

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
    await nodeA.wallet.scan()

    const blockB1 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
    await expect(nodeB.chain).toAddBlock(blockB1)
    const blockB2 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
    await expect(nodeB.chain).toAddBlock(blockB2)
    const blockB3 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
    await expect(nodeB.chain).toAddBlock(blockB3)

    // This transaction will be invalid after the reorg
    const { block: blockA2 } = await useBlockWithTx(nodeA, accountA, accountB, false)
    await expect(nodeA.chain).toAddBlock(blockA2)
    await nodeA.wallet.scan()

    // Create a transaction that spends notes from the invalid transaction
    const forkSpendTx = await useTxFixture(nodeA.wallet, accountA, accountB)

    expect(forkSpendTx.spends.length).toEqual(1)

    const forkSpendNullifier = forkSpendTx.spends[0].nullifier
    const forkSpendNoteHash = await accountA.getNoteHash(forkSpendNullifier)

    // nullifier should be defined
    Assert.isNotUndefined(forkSpendNoteHash)

    // re-org
    await expect(nodeA.chain).toAddBlock(blockB1)
    await expect(nodeA.chain).toAddBlock(blockB2)
    await expect(nodeA.chain).toAddBlock(blockB3)
    expect(nodeA.chain.head.hash.equals(blockB3.header.hash)).toBe(true)
    await nodeA.wallet.scan()

    const forkSpendNote = await accountA.getDecryptedNote(forkSpendNoteHash)
    expect(forkSpendNote).toBeDefined()
    expect(forkSpendNote?.nullifier).toBeNull()

    // nullifier should have been removed from nullifierToNote
    expect(await accountA.getNoteHash(forkSpendNullifier)).toBeUndefined()
  })

  describe('fund', () => {
    it('should select notes in order of largest to smallest', async () => {
      const { node } = nodeTest
      const accountA = await useAccountFixture(node.wallet, 'a')
      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(blockA1)
      await node.wallet.scan()

      const transaction = await useTxFixture(node.wallet, accountA, accountA)
      const block = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet, [
        transaction,
      ])
      await node.chain.addBlock(block)
      await node.wallet.scan()

      const rawTransaction = new RawTransaction(TransactionVersion.V2)
      const note = new NativeNote(
        accountA.publicAddress,
        BigInt(ORE_TO_IRON * 10),
        Buffer.alloc(0),
        Asset.nativeId(),
        accountA.publicAddress,
      )

      rawTransaction.outputs.push({ note: new Note(note.serialize()) })

      await node.wallet.fund(rawTransaction, {
        account: accountA,
        confirmations: 0,
      })

      // if this fails, it means that the notes were not sorted in descending order
      // multiple smaller notes were used to fund the transaction
      expect(rawTransaction.spends).toHaveLength(1)
    })

    it('should throw error if transaction exceeds maximum size', async () => {
      const { node } = nodeTest

      const account = await useAccountFixture(node.wallet, 'a')

      const block1 = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
      await expect(node.chain).toAddBlock(block1)
      await node.wallet.scan()

      // Mock verifier to only allow transactions of size 0
      jest.spyOn(Verifier, 'getMaxTransactionBytes').mockImplementationOnce((_) => 0)

      const rawTransaction = new RawTransaction(TransactionVersion.V2)
      const note = new NativeNote(
        account.publicAddress,
        1n,
        Buffer.alloc(0),
        Asset.nativeId(),
        account.publicAddress,
      )

      rawTransaction.outputs.push({ note: new Note(note.serialize()) })

      const promise = node.wallet.fund(rawTransaction, {
        account: account,
        confirmations: 0,
      })

      await expect(promise).rejects.toThrow(MaxTransactionSizeError)
    })
  })

  describe('getBalances', () => {
    it('returns balances for all unspent notes across assets for an account', async () => {
      const { node } = await nodeTest.createSetup()
      const account = await useAccountFixture(node.wallet)

      const mined = await useMinerBlockFixture(node.chain, 2, account)
      await expect(node.chain).toAddBlock(mined)
      await node.wallet.scan()

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
      await node.wallet.scan()

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

      await nodeA.wallet.scan()
      await nodeB.wallet.scan()

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

  describe('getEarliestHead', () => {
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

      expect(await node.wallet.getEarliestHead()).toEqual(null)
    })

    it('should skip accounts with scanning disabled', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      await node.wallet.scan()
      await accountA.updateScanningEnabled(false)

      const blockA = await useMinerBlockFixture(node.chain, 2, accountA)
      await node.chain.addBlock(blockA)
      const blockB = await useMinerBlockFixture(node.chain, 3, accountA)
      await node.chain.addBlock(blockB)
      await node.wallet.scan()

      expect((await accountA.getHead())?.sequence).toBe(1)
      expect((await accountB.getHead())?.sequence).toBe(3)

      expect((await node.wallet.getEarliestHead())?.hash).toEqualBuffer(blockB.header.hash)

      await accountB.updateScanningEnabled(false)

      expect(await node.wallet.getEarliestHead()).toBeNull()
    })
  })

  describe('getLatestHead', () => {
    it('should return the latest head', async () => {
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

      const head = await node.wallet.getLatestHead()
      expect(head?.hash).toEqualBuffer(blockB.header.hash)
      expect(head?.sequence).toEqual(blockB.header.sequence)
    })

    it('should skip accounts with scanning disabled', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const blockA = await useMinerBlockFixture(node.chain, 2, accountA)
      await node.chain.addBlock(blockA)

      await node.wallet.scan()
      await accountA.updateScanningEnabled(false)

      const blockB = await useMinerBlockFixture(node.chain, 3, accountA)
      await node.chain.addBlock(blockB)
      await node.wallet.scan()

      await accountA.updateScanningEnabled(true)
      await accountB.updateScanningEnabled(false)

      expect((await accountA.getHead())?.sequence).toBe(2)
      expect((await accountB.getHead())?.sequence).toBe(3)

      const head = await node.wallet.getLatestHead()
      expect(head?.hash).toEqualBuffer(blockA.header.hash)
      expect(head?.sequence).toEqual(blockA.header.sequence)

      await accountA.updateScanningEnabled(false)

      expect(await node.wallet.getLatestHead()).toBeNull()
    })
  })

  describe('importAccount', () => {
    it('should not import accounts with duplicate name', async () => {
      const { node } = nodeTest

      const account = await useAccountFixture(node.wallet, 'accountA')

      expect(node.wallet.accountExists(account.name)).toEqual(true)

      await expect(node.wallet.importAccount(account)).rejects.toThrow(
        DuplicateAccountNameError,
      )
    })

    it('should not import accounts with duplicate keys', async () => {
      const { node } = nodeTest

      const account = await useAccountFixture(node.wallet, 'accountA')

      expect(node.wallet.accountExists(account.name)).toEqual(true)

      const clone = { ...account }
      clone.name = 'Different name'

      await expect(node.wallet.importAccount(clone)).rejects.toThrow(DuplicateSpendingKeyError)
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
        createdAt: null,
        ...key,
        ledger: true,
      }
      const viewonlyAccount = await node.wallet.importAccount(accountValue)
      expect(viewonlyAccount.name).toEqual(accountValue.name)
      expect(viewonlyAccount.viewKey).toEqual(key.viewKey)
      expect(viewonlyAccount.incomingViewKey).toEqual(key.incomingViewKey)
      expect(viewonlyAccount.outgoingViewKey).toEqual(key.outgoingViewKey)
      expect(viewonlyAccount.spendingKey).toBeNull()
      expect(viewonlyAccount.publicAddress).toEqual(key.publicAddress)
    })

    it('should be able to import a viewonly account if it is a dupe', async () => {
      const { node } = nodeTest
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { spendingKey, ...key } = generateKey()
      const accountValue = {
        id: uuid(),
        name: 'viewonly',
        version: 1,
        spendingKey: null,
        createdAt: null,
        ...key,
        ledger: true,
      }
      const accountImport1 = await node.wallet.importAccount(accountValue)
      const clone = { ...accountValue }
      clone.name = 'Different name'

      const accountImport2 = await node.wallet.importAccount(clone)

      expect(accountImport2.createdAt).toBeDefined()
      expect(accountImport1.viewKey).toEqual(accountImport2.viewKey)
    })

    it('should set createdAt if networkId matches', async () => {
      const { node: nodeA } = await nodeTest.createSetup()
      const { node: nodeB } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(nodeA.wallet, 'accountA', { createdAt: null })
      expect(accountA.createdAt).toBe(null)

      // create blocks and add them to both chains
      const block2 = await useMinerBlockFixture(nodeA.chain, 2)
      await nodeA.chain.addBlock(block2)
      await nodeB.chain.addBlock(block2)
      await nodeA.wallet.scan()
      const block3 = await useMinerBlockFixture(nodeA.chain, 3)
      await nodeA.chain.addBlock(block3)
      await nodeB.chain.addBlock(block3)
      await nodeA.wallet.scan()

      // create an account so that createdAt will be non-null
      const accountB = await useAccountFixture(nodeA.wallet, 'accountB')

      expect(accountB.createdAt?.sequence).toEqual(3)

      const accountBImport = await nodeB.wallet.importAccount(
        toAccountImport(accountB, false, nodeB.wallet.networkId),
      )

      expect(accountBImport.createdAt?.sequence).toEqual(3)
    })

    it('should set account head to block before createdAt if networkId matches', async () => {
      const { node: nodeA } = await nodeTest.createSetup()
      const { node: nodeB } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(nodeA.wallet, 'accountA', { createdAt: null })
      expect(accountA.createdAt).toBe(null)

      // create blocks and add them to both chains
      const block2 = await useMinerBlockFixture(nodeA.chain, 2)
      await nodeA.chain.addBlock(block2)
      await nodeB.chain.addBlock(block2)
      await nodeA.wallet.scan()
      const block3 = await useMinerBlockFixture(nodeA.chain, 3)
      await nodeA.chain.addBlock(block3)
      await nodeB.chain.addBlock(block3)
      await nodeA.wallet.scan()

      // create an account so that createdAt will be non-null
      const accountB = await useAccountFixture(nodeA.wallet, 'accountB')

      const accountBImport = await nodeB.wallet.importAccount(
        toAccountImport(accountB, false, nodeB.wallet.networkId),
      )

      expect(accountBImport.createdAt?.sequence).toEqual(3)

      const accountBImportHead = await accountBImport.getHead()

      expect(accountBImportHead?.hash).toEqualHash(block2.header.hash)
      expect(accountBImportHead?.sequence).toEqual(2)
    })

    it('should set createdAt to null if networkId does not match', async () => {
      const { node: nodeA } = await nodeTest.createSetup()
      const { node: nodeB } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(nodeA.wallet, 'accountA', { createdAt: null })
      expect(accountA.createdAt).toBe(null)

      // create blocks but only add them to one chain
      const block2 = await useMinerBlockFixture(nodeA.chain, 2)
      await nodeA.chain.addBlock(block2)
      await nodeA.wallet.scan()
      const block3 = await useMinerBlockFixture(nodeA.chain, 3)
      await nodeA.chain.addBlock(block3)
      await nodeA.wallet.scan()

      // create an account on nodeA so that createdAt will be non-null
      const accountB = await useAccountFixture(nodeA.wallet, 'accountB')

      expect(accountB.createdAt?.sequence).toEqual(3)

      const accountBImport = await nodeB.wallet.importAccount(
        toAccountImport(accountB, false, 42),
      )

      expect(accountBImport.createdAt).toBeDefined()
    })

    it('should throw an error when the wallet is encrypted and there is no passphrase', async () => {
      const { node } = await nodeTest.createSetup()
      const passphrase = 'foo'

      await useAccountFixture(node.wallet, 'A')
      await node.wallet.encrypt(passphrase)

      const key = generateKey()
      const accountValue: DecryptedAccountValue = {
        encrypted: false,
        id: '0',
        name: 'new-account',
        version: 1,
        createdAt: null,
        scanningEnabled: false,
        ...key,
        ledger: false,
      }

      await expect(node.wallet.importAccount(accountValue)).rejects.toThrow()
    })

    it('should encrypt and store the account if the wallet is encrypted', async () => {
      const { node } = await nodeTest.createSetup()
      const passphrase = 'foo'

      await useAccountFixture(node.wallet, 'A')
      await node.wallet.encrypt(passphrase)

      const key = generateKey()
      const accountValue: DecryptedAccountValue = {
        encrypted: false,
        id: '0',
        name: 'new-account',
        version: 1,
        createdAt: null,
        scanningEnabled: false,
        ...key,
        ledger: false,
      }

      await node.wallet.unlock(passphrase)
      const account = await node.wallet.importAccount(accountValue)
      await node.wallet.lock()

      expect(account.name).toEqual(accountValue.name)
      expect(account.viewKey).toEqual(key.viewKey)
      expect(account.incomingViewKey).toEqual(key.incomingViewKey)
      expect(account.outgoingViewKey).toEqual(key.outgoingViewKey)
      expect(account.spendingKey).toEqual(key.spendingKey)
      expect(account.publicAddress).toEqual(key.publicAddress)
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

      await node.wallet.scan()

      await useTxFixture(
        node.wallet,
        accountA,
        accountB,
        undefined,
        undefined,
        node.chain.head.sequence + 1,
      )

      const expireSpy = jest.spyOn(accountA, 'expireTransaction')

      await node.wallet.expireTransactions(block1.header.sequence)

      expect(expireSpy).toHaveBeenCalledTimes(0)
    })

    it('should not expire transactions with expiration sequence of 0', async () => {
      const { node } = nodeTest
      node.chain['synced'] = true

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const block1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block1)

      await node.wallet.scan()

      await useTxFixture(node.wallet, accountA, accountB, undefined, undefined, 0)

      const expireSpy = jest.spyOn(accountA, 'expireTransaction')

      await node.wallet.expireTransactions(block1.header.sequence)

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

      await node.wallet.scan()

      const tx = await useTxFixture(node.wallet, accountA, accountB, undefined, undefined, 3)

      const block3 = await useMinerBlockFixture(node.chain, 3, accountA, node.wallet)

      await accountA.getTransaction(tx.hash())

      let expiredA = await AsyncUtils.materialize(
        accountA.getExpiredTransactions(block3.header.sequence),
      )
      expect(expiredA.length).toEqual(1)

      let expiredB = await AsyncUtils.materialize(
        accountB.getExpiredTransactions(block3.header.sequence),
      )
      expect(expiredB.length).toEqual(1)

      await node.wallet.expireTransactions(block3.header.sequence)

      expiredA = await AsyncUtils.materialize(
        accountA.getExpiredTransactions(block3.header.sequence),
      )
      expect(expiredA.length).toEqual(0)

      expiredB = await AsyncUtils.materialize(
        accountB.getExpiredTransactions(block3.header.sequence),
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

      await node.wallet.scan()

      const transaction = await useTxFixture(
        node.wallet,
        accountA,
        accountB,
        undefined,
        undefined,
        3,
      )

      const block3 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)

      const expireTransactionSpy = jest.spyOn(accountA, 'expireTransaction')

      await node.wallet.expireTransactions(block3.header.sequence)

      expect(expireTransactionSpy).toHaveBeenCalledTimes(1)
      expect(expireTransactionSpy).toHaveBeenCalledWith(transaction)

      expireTransactionSpy.mockClear()

      await node.wallet.expireTransactions(block3.header.sequence)

      expect(expireTransactionSpy).toHaveBeenCalledTimes(0)
    })
  })

  describe('deleteTransaction', () => {
    it('should delete a pending transaction', async () => {
      const { node, wallet } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const block = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block)

      await node.wallet.scan()

      const transaction = await useTxFixture(node.wallet, accountA, accountB)

      // ensure account A has the transaction as pending
      const txValueA = await accountA.getTransaction(transaction.hash())
      Assert.isNotUndefined(txValueA)
      const statusA = await wallet.getTransactionStatus(accountA, txValueA)
      expect(statusA).toEqual(TransactionStatus.PENDING)

      // ensure account B has the transaction as pending
      const txValueB = await accountA.getTransaction(transaction.hash())
      Assert.isNotUndefined(txValueB)
      const statusB = await wallet.getTransactionStatus(accountA, txValueB)
      expect(statusB).toEqual(TransactionStatus.PENDING)

      const deleted = await wallet.deleteTransaction(transaction.hash())
      expect(deleted).toEqual(true)

      expect(await accountA.getTransaction(transaction.hash())).toBeUndefined()
      expect(await accountB.getTransaction(transaction.hash())).toBeUndefined()
    })

    it('should delete an expired transaction', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)

      await node.wallet.scan()

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

      await node.wallet.scan()

      await node.wallet.expireTransactions(block3.header.sequence)

      // ensure account A has the transaction as expired
      const txValueA = await accountA.getTransaction(transaction.hash())
      Assert.isNotUndefined(txValueA)
      const statusA = await node.wallet.getTransactionStatus(accountA, txValueA)
      expect(statusA).toEqual(TransactionStatus.EXPIRED)

      // ensure account B has the transaction as expired
      const txValueB = await accountA.getTransaction(transaction.hash())
      Assert.isNotUndefined(txValueB)
      const statusB = await node.wallet.getTransactionStatus(accountA, txValueB)
      expect(statusB).toEqual(TransactionStatus.EXPIRED)

      const deleted = await node.wallet.deleteTransaction(transaction.hash())
      expect(deleted).toEqual(true)

      expect(await accountA.getTransaction(transaction.hash())).toBeUndefined()
      expect(await accountB.getTransaction(transaction.hash())).toBeUndefined()
    })

    it('should not delete an unconfirmed transaction', async () => {
      const { node, wallet } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const block = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block)

      await node.wallet.scan()

      const transaction = await useTxFixture(node.wallet, accountA, accountB)

      const block3 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet, [
        transaction,
      ])
      await node.chain.addBlock(block3)

      await node.wallet.scan()

      node.config.set('confirmations', 1)

      // ensure account A has the transaction as pending
      const txValueA = await accountA.getTransaction(transaction.hash())
      Assert.isNotUndefined(txValueA)
      const statusA = await wallet.getTransactionStatus(accountA, txValueA)
      expect(statusA).toEqual(TransactionStatus.UNCONFIRMED)

      // ensure account B has the transaction as pending
      const txValueB = await accountA.getTransaction(transaction.hash())
      Assert.isNotUndefined(txValueB)
      const statusB = await wallet.getTransactionStatus(accountA, txValueB)
      expect(statusB).toEqual(TransactionStatus.UNCONFIRMED)

      const deleted = await wallet.deleteTransaction(transaction.hash())
      expect(deleted).toEqual(false)

      expect(await accountA.getTransaction(transaction.hash())).toBeDefined()
      expect(await accountB.getTransaction(transaction.hash())).toBeDefined()
    })

    it('should not delete a confirmed transaction', async () => {
      const { node, wallet } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const block = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block)

      await node.wallet.scan()

      const transaction = await useTxFixture(node.wallet, accountA, accountB)

      const block3 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet, [
        transaction,
      ])
      await node.chain.addBlock(block3)

      await node.wallet.scan()

      // ensure account A has the transaction as pending
      const txValueA = await accountA.getTransaction(transaction.hash())
      Assert.isNotUndefined(txValueA)
      const statusA = await wallet.getTransactionStatus(accountA, txValueA)
      expect(statusA).toEqual(TransactionStatus.CONFIRMED)

      // ensure account B has the transaction as pending
      const txValueB = await accountA.getTransaction(transaction.hash())
      Assert.isNotUndefined(txValueB)
      const statusB = await wallet.getTransactionStatus(accountA, txValueB)
      expect(statusB).toEqual(TransactionStatus.CONFIRMED)

      const deleted = await wallet.deleteTransaction(transaction.hash())
      expect(deleted).toEqual(false)

      expect(await accountA.getTransaction(transaction.hash())).toBeDefined()
      expect(await accountB.getTransaction(transaction.hash())).toBeDefined()
    })
  })

  describe('createAccount', () => {
    it('should set createdAt to the chain head', async () => {
      const node = nodeTest.node

      const block2 = await useMinerBlockFixture(node.chain, 2)
      await node.chain.addBlock(block2)

      const account = await node.wallet.createAccount('test')

      expect(account.createdAt?.sequence).toEqual(block2.header.sequence)
    })

    it('should set account head to the chain head', async () => {
      const node = nodeTest.node

      const block2 = await useMinerBlockFixture(node.chain, 2)
      await node.chain.addBlock(block2)

      const account = await node.wallet.createAccount('test')

      const head = await account.getHead()

      expect(head?.hash).toEqualHash(block2.header.hash)
      expect(head?.sequence).toEqual(block2.header.sequence)
    })

    it('should not allow blank names', async () => {
      const node = nodeTest.node

      await expect(node.wallet.createAccount('')).rejects.toThrow(
        'Account name cannot be blank',
      )

      await expect(node.wallet.createAccount('     ')).rejects.toThrow(
        'Account name cannot be blank',
      )
    })

    it('should throw an error if the wallet is encrypted and no passphrase is provided', async () => {
      const { node } = await nodeTest.createSetup()
      const passphrase = 'foo'

      await useAccountFixture(node.wallet, 'A')
      await node.wallet.encrypt(passphrase)

      await expect(node.wallet.createAccount('B')).rejects.toThrow()
    })

    it('should save a new encrypted account with the correct passphrase', async () => {
      const { node } = await nodeTest.createSetup()
      const passphrase = 'foo'

      await useAccountFixture(node.wallet, 'A')
      await node.wallet.encrypt(passphrase)

      await node.wallet.unlock(passphrase)
      const account = await node.wallet.createAccount('B')

      const accountValue = await node.wallet.walletDb.accounts.get(account.id)
      Assert.isNotUndefined(accountValue)
      Assert.isTrue(accountValue.encrypted)

      const encryptedAccount = new EncryptedAccount({
        accountValue,
        walletDb: node.wallet.walletDb,
      })

      const masterKey = node.wallet['masterKey']
      Assert.isNotNull(masterKey)
      await masterKey.unlock(passphrase)
      const decryptedAccount = encryptedAccount.decrypt(masterKey)
      await node.wallet.lock()

      expect(decryptedAccount.spendingKey).toEqual(account.spendingKey)
      expect(decryptedAccount.name).toEqual(account.name)
    })
  })

  describe('removeAccount', () => {
    it('should delete account', async () => {
      const node = nodeTest.node
      node.wallet['isStarted'] = true

      const account = await useAccountFixture(node.wallet)
      const tx = await useMinersTxFixture(node, account)
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

      await node.wallet.scan()

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
            memo: Buffer.alloc(32),
            assetId: Asset.nativeId(),
          },
        ],
        expiration: 0,
      })

      await expect(rawTransaction).rejects.toThrow(
        'Fee or FeeRate is required to create a transaction',
      )
    })

    it('should throw error if memo is too long', async () => {
      const account = await useAccountFixture(nodeTest.node.wallet, 'a')
      const promise = nodeTest.wallet.createTransaction({
        account: account,
        fee: 1n,
        outputs: [
          {
            publicAddress: account.publicAddress,
            amount: 1n,
            memo: Buffer.alloc(MEMO_LENGTH + 1),
            assetId: Asset.nativeId(),
          },
        ],
      })
      await expect(promise).rejects.toThrow(MaxMemoLengthError)
    })

    it('should create raw transaction with fee rate', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'a')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)

      await node.wallet.scan()

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
            memo: Buffer.alloc(32),
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

    it('should create transaction with a list of note hashes to spend', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'a')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      const blockA2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA2)
      const blockA3 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA3)

      await node.wallet.scan()

      const notes = [blockA2.minersFee.notes[0].hash()]

      const rawTransaction = await node.wallet.createTransaction({
        account: accountA,
        notes,
        outputs: [
          {
            publicAddress: '0d804ea639b2547d1cd612682bf99f7cad7aad6d59fd5457f61272defcd4bf5b',
            amount: 10n,
            memo: Buffer.alloc(32),
            assetId: Asset.nativeId(),
          },
        ],
        expiration: 0,
        fee: 1n,
      })

      expect(rawTransaction.spends.length).toBe(1)

      const spentNoteHashes = rawTransaction.spends.map((spend) => spend.note.hash())
      expect(spentNoteHashes).toEqual(notes)
    })

    it('should create transaction with a list of multiple note hashes to spend', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'a')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      const blockA2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA2)
      const blockA3 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA3)

      await node.wallet.scan()

      const notes = [blockA2.minersFee.notes[0].hash(), blockA3.minersFee.notes[0].hash()]

      const rawTransaction = await node.wallet.createTransaction({
        account: accountA,
        notes,
        outputs: [
          {
            publicAddress: '0d804ea639b2547d1cd612682bf99f7cad7aad6d59fd5457f61272defcd4bf5b',
            amount: 10n,
            memo: Buffer.alloc(32),
            assetId: Asset.nativeId(),
          },
        ],
        expiration: 0,
        fee: 1n,
      })

      expect(rawTransaction.spends.length).toBe(2)

      const spentNoteHashes = rawTransaction.spends.map((spend) => spend.note.hash())
      expect(spentNoteHashes).toEqual(notes)
    })

    it('should partially fund a transaction if the note hashes to spend have insufficient funds', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'a')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      const blockA2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA2)
      const blockA3 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA3)

      await node.wallet.scan()

      const notes = [blockA2.minersFee.notes[0].hash()]

      const rawTransaction = await node.wallet.createTransaction({
        account: accountA,
        notes,
        outputs: [
          {
            publicAddress: '0d804ea639b2547d1cd612682bf99f7cad7aad6d59fd5457f61272defcd4bf5b',
            amount: 2000000000n,
            memo: Buffer.alloc(32),
            assetId: Asset.nativeId(),
          },
        ],
        expiration: 0,
        fee: 1n,
      })

      expect(rawTransaction.spends.length).toBe(2)

      const spentNoteHashes = new BufferSet()
      for (const spend of rawTransaction.spends) {
        spentNoteHashes.add(spend.note.hash())
      }

      expect(spentNoteHashes.has(notes[0])).toBe(true)
    })

    it('should create transactions with spends valid after a reorg', async () => {
      // create two chains to create a fork
      const { node: nodeA } = await nodeTest.createSetup()
      const { node: nodeB } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(nodeA.wallet, 'a')
      const accountB = await useAccountFixture(nodeA.wallet, 'b')

      // add blockA2 to both chains so that the notes spent from this block are valid
      const blockA2 = await useMinerBlockFixture(nodeA.chain, undefined, accountA, nodeA.wallet)
      await expect(nodeA.chain).toAddBlock(blockA2)
      await expect(nodeB.chain).toAddBlock(blockA2)
      await nodeA.wallet.scan()
      await nodeB.wallet.scan()

      // add blockA3 to chain A
      const blockA3 = await useMinerBlockFixture(nodeA.chain)
      await expect(nodeA.chain).toAddBlock(blockA3)
      await nodeA.wallet.scan()

      // set confirmations so that witness will use confirmed tree size at blockA2
      nodeA.config.set('confirmations', 1)

      // create a transaction from accountA to accountB
      const transaction = await useTxFixture(nodeA.wallet, accountA, accountB)

      const verification = await nodeA.chain.verifier.verifyTransactionAdd(transaction)

      expect(verification.valid).toBe(true)

      // create a fork on chain B
      const blockB3 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
      await expect(nodeB.chain).toAddBlock(blockB3)
      const blockB4 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
      await expect(nodeB.chain).toAddBlock(blockB4)
      await nodeB.wallet.scan()

      // reorg chain A
      await expect(nodeA.chain).toAddBlock(blockB3)
      await expect(nodeA.chain).toAddBlock(blockB4)
      expect(nodeA.chain.head.hash.equals(blockB4.header.hash)).toBe(true)
      await nodeA.wallet.scan()

      const reorgVerification = await nodeA.chain.verifier.verifyTransactionAdd(transaction)
      expect(reorgVerification.valid).toBe(true)
    })

    describe('should create transactions with the correct version', () => {
      const preservedNodeTest = createNodeTest(true)
      let chain: Blockchain
      let wallet: Wallet
      let account: Account

      const testPermutations = [
        { delta: 50, expectedVersion: TransactionVersion.V1 },
        { delta: 25, expectedVersion: TransactionVersion.V1 },
        { delta: 10, expectedVersion: TransactionVersion.V1 },
        { delta: 3, expectedVersion: TransactionVersion.V2 },
        { delta: 1, expectedVersion: TransactionVersion.V2 },
      ]

      beforeAll(async () => {
        const { chain: testChain, wallet: testWallet } = await preservedNodeTest.createSetup()
        chain = testChain
        wallet = testWallet

        chain.consensus.parameters.enableAssetOwnership = 999999
        account = await useAccountFixture(wallet, 'test')

        const block = await useMinerBlockFixture(chain, undefined, account, wallet)
        const { isAdded } = await chain.addBlock(block)
        Assert.isTrue(isAdded)
        await wallet.scan()

        Assert.isEqual(chain.head.sequence, 2)
      })

      testPermutations.forEach(({ delta, expectedVersion }) => {
        it(`delta: ${delta}, expectedVersion: ${expectedVersion}`, async () => {
          // transaction version change happening `delta` blocks ahead of the chain
          chain.consensus.parameters.enableAssetOwnership = chain.head.sequence + delta

          // default expiration
          let tx = await wallet.createTransaction({ account, fee: 0n })
          expect(tx.version).toEqual(expectedVersion)

          tx = await wallet.createTransaction({
            account,
            fee: 0n,
            expirationDelta: delta,
          })
          expect(tx.version).toEqual(expectedVersion)

          tx = await wallet.createTransaction({
            account,
            fee: 0n,
            expiration: chain.head.sequence + delta,
          })
          expect(tx.version).toEqual(expectedVersion)
        })
      })
    })

    it('should not add spends if minted value equal to output value', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'a')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.scan()

      // create and mint an asset
      const asset = new Asset(accountA.publicAddress, 'mint-asset', 'metadata')
      const blockA2 = await useMintBlockFixture({ node, account: accountA, asset, value: 10n })
      await expect(node.chain).toAddBlock(blockA2)
      await node.wallet.scan()

      // create transaction to mint asset and send to another address
      const rawTransaction = await node.wallet.createTransaction({
        account: accountA,
        mints: [
          {
            creator: accountA.publicAddress,
            name: BufferUtils.toHuman(asset.name()),
            metadata: BufferUtils.toHuman(asset.metadata()),
            value: 20n,
          },
        ],
        outputs: [
          {
            publicAddress: '0d804ea639b2547d1cd612682bf99f7cad7aad6d59fd5457f61272defcd4bf5b',
            amount: 20n,
            memo: Buffer.alloc(32),
            assetId: asset.id(),
          },
        ],
        expiration: 0,
        fee: 0n,
      })

      // no spends needed
      expect(rawTransaction.spends.length).toBe(0)
    })

    it('should throw error if transaction exceeds maximum size', async () => {
      const { node } = nodeTest

      const account = await useAccountFixture(node.wallet, 'a')

      const block1 = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
      await expect(node.chain).toAddBlock(block1)
      await node.wallet.scan()

      // Mock verifier to only allow transactions of size 0
      jest.spyOn(Verifier, 'getMaxTransactionBytes').mockImplementationOnce((_) => 0)

      const promise = nodeTest.wallet.createTransaction({
        account: account,
        fee: 0n,
        outputs: [
          {
            publicAddress: account.publicAddress,
            amount: 1n,
            memo: Buffer.alloc(0),
            assetId: Asset.nativeId(),
          },
        ],
      })
      await expect(promise).rejects.toThrow(MaxTransactionSizeError)
    })
  })

  describe('getTransactionStatus', () => {
    it('should show unconfirmed transactions as unconfirmed', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'a')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)

      await node.wallet.scan()

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

      await node.wallet.scan()

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

      await node.wallet.scan()

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

      await node.wallet.scan()

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

      await node.wallet.scan()

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

      await node.wallet.scan()

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

      await node.wallet.scan()

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
      await node.wallet.scan()

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
      await node.wallet.scan()

      const transactionValue = await accountA.getTransaction(transaction.hash())
      Assert.isNotUndefined(transactionValue)

      const transactionStatus = await node.wallet.getTransactionStatus(
        accountA,
        transactionValue,
      )
      expect(transactionStatus).toEqual(TransactionStatus.EXPIRED)

      const broadcastSpy = jest.spyOn(node.wallet, 'broadcastTransaction')

      await node.wallet.rebroadcastTransactions(node.chain.head.sequence)

      expect(broadcastSpy).toHaveBeenCalledTimes(0)
    })
  })

  describe('addPendingTransaction', () => {
    it('should not decrypt notes for accounts that have already seen the transaction', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')
      const accountB = await useAccountFixture(node.wallet, 'b')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.scan()

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
      await node.wallet.scan()

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

  describe('scan', () => {
    it('should update head status', async () => {
      // G -> 1 -> 2
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const block1 = await useMinerBlockFixture(node.chain, 2, accountA)
      await expect(node.chain).toAddBlock(block1)
      await node.wallet.scan()

      // create a second account and import it so that its head hash is null
      const { node: nodeB } = await nodeTest.createSetup()
      const toImport = await useAccountFixture(nodeB.wallet, 'accountB')

      const accountB = await node.wallet.importAccount(toImport)

      // Confirm pre-rescan state
      await expect(accountA.getHead()).resolves.toEqual({
        hash: block1.header.hash,
        sequence: block1.header.sequence,
      })
      await expect(accountB.getHead()).resolves.toEqual(null)

      // Add second block
      const block2 = await useMinerBlockFixture(node.chain, 3, accountA)
      await expect(node.chain).toAddBlock(block2)

      await node.wallet.scan()

      await expect(accountA.getHead()).resolves.toEqual({
        hash: block2.header.hash,
        sequence: block2.header.sequence,
      })
      await expect(accountB.getHead()).resolves.toEqual({
        hash: block2.header.hash,
        sequence: block2.header.sequence,
      })
    })

    it('should not scan if wallet is disabled', async () => {
      const { wallet, chain } = await nodeTest.createSetup({ config: { enableWallet: false } })

      // Create a new account but don't give it an account birthday so the wallet head does not update
      await useAccountFixture(wallet, 'test', { createdAt: null })

      const block1 = await useMinerBlockFixture(chain)
      await expect(chain).toAddBlock(block1)

      const scanSpy = jest.spyOn(wallet.scanner, 'scan')
      await wallet.scan()
      expect(scanSpy).not.toHaveBeenCalled()
    })

    it('should not scan if all accounts are up to date', async () => {
      const { chain, wallet } = nodeTest

      const accountA = await useAccountFixture(wallet, 'accountA')
      const accountB = await useAccountFixture(wallet, 'accountB')

      const block1 = await useMinerBlockFixture(chain)
      await expect(chain).toAddBlock(block1)

      await wallet.scan()

      await expect(accountA.getHead()).resolves.toEqual({
        hash: block1.header.hash,
        sequence: block1.header.sequence,
      })
      await expect(accountB.getHead()).resolves.toEqual({
        hash: block1.header.hash,
        sequence: block1.header.sequence,
      })

      const connectSpy = jest.spyOn(wallet, 'connectBlockForAccount')

      await wallet.scan()

      expect(connectSpy).not.toHaveBeenCalled()
    })

    it('should scan until the chain head', async () => {
      const { node } = await nodeTest.createSetup()

      // create an account so that the wallet will sync
      await useAccountFixture(node.wallet, 'a')

      // update wallet to genesis block
      await node.wallet.scan()

      const block2 = await useMinerBlockFixture(node.chain, undefined)
      await expect(node.chain).toAddBlock(block2)
      const block3 = await useMinerBlockFixture(node.chain, undefined)
      await expect(node.chain).toAddBlock(block3)

      expect(node.chain.head.hash).toEqualHash(block3.header.hash)

      let head = await node.wallet.getEarliestHead()
      expect(head?.hash).toEqualHash(node.chain.genesis.hash)

      // set max syncing queue to 1 so that wallet only fetches one block at a time
      node.wallet.scanner.config.set('walletSyncingMaxQueueSize', 1)

      await node.wallet.scan()

      head = await node.wallet.getEarliestHead()
      expect(head?.hash).toEqualHash(node.chain.head.hash)
    })

    it('should start from null account head', async () => {
      // G -> 1 -> 2
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const block1 = await useMinerBlockFixture(node.chain, 2, accountA)
      await expect(node.chain).toAddBlock(block1)
      await node.wallet.scan()

      // create a second account and import it so that its head hash is null
      const { node: nodeB } = await nodeTest.createSetup()
      const toImport = await useAccountFixture(nodeB.wallet, 'accountB')

      const accountB = await node.wallet.importAccount(toImport)

      // Confirm pre-rescan state
      await expect(accountA.getHead()).resolves.toEqual({
        hash: block1.header.hash,
        sequence: block1.header.sequence,
      })
      await expect(accountB.getHead()).resolves.toEqual(null)

      // Add second block
      const block2 = await useMinerBlockFixture(node.chain, 3, accountA)
      await expect(node.chain).toAddBlock(block2)

      await node.wallet.scan()

      await expect(accountA.getHead()).resolves.toEqual({
        hash: block2.header.hash,
        sequence: block2.header.sequence,
      })
      await expect(accountB.getHead()).resolves.toEqual({
        hash: block2.header.hash,
        sequence: block2.header.sequence,
      })
    })

    it('should update balance hash and sequence for each block', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')
      const accountB = await useAccountFixture(node.wallet, 'b')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.scan()

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
      await node.wallet.scan()

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
      await node.wallet.scan()

      await expect(accountA.getUnconfirmedBalance(Asset.nativeId())).resolves.toMatchObject({
        blockHash: blockA1.header.hash,
        sequence: blockA1.header.sequence,
        unconfirmed: 2000000000n,
      })

      const asset = new Asset(accountA.publicAddress, 'fakeasset', 'metadata')
      const value = BigInt(10)
      const mintBlock = await useMintBlockFixture({
        node,
        account: accountA,
        asset,
        value,
        sequence: 3,
      })
      await expect(node.chain).toAddBlock(mintBlock)
      await node.wallet.scan()

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
      await node.wallet.scan()

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
      await node.wallet.scan()

      const asset = new Asset(accountA.publicAddress, 'fakeasset', 'metadata')
      const value = BigInt(10)
      const mintBlock = await useMintBlockFixture({
        node,
        account: accountA,
        asset,
        value,
        sequence: 3,
      })
      await expect(node.chain).toAddBlock(mintBlock)
      await node.wallet.scan()

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
      await node.wallet.scan()

      expect(await accountA['walletDb'].getAsset(accountA, asset.id())).toEqual({
        blockHash: mintBlock.header.hash,
        createdTransactionHash: mintBlock.transactions[1].hash(),
        id: asset.id(),
        metadata: asset.metadata(),
        name: asset.name(),
        nonce: asset.nonce(),
        creator: Buffer.from(accountA.publicAddress, 'hex'),
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
        nonce: asset.nonce(),
        creator: Buffer.from(accountA.publicAddress, 'hex'),
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
      await node.wallet.scan()
      await node2.wallet.scan()

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
      await node.wallet.scan()

      await expect(accountA.hasTransaction(transaction.hash())).resolves.toBe(true)
      await expect(accountAImport.hasTransaction(transaction.hash())).resolves.toBe(false)

      // update node2 so that transaction is connected to imported account
      await node2.wallet.scan()

      await expect(accountAImport.hasTransaction(transaction.hash())).resolves.toBe(true)
    })

    it('should set null account.createdAt for the first on-chain transaction of an account', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'accountA', { createdAt: null })

      expect(accountA.createdAt).toBeNull()

      const block2 = await useMinerBlockFixture(node.chain, 2, accountA)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      expect(accountA.createdAt?.sequence).toEqual(block2.header.sequence)
    })

    it('should not set account.createdAt if the account has no transaction on the block', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'accountA', { createdAt: null })
      const accountB = await useAccountFixture(node.wallet, 'accountB', { createdAt: null })

      expect(accountA.createdAt).toBeNull()
      expect(accountB.createdAt).toBeNull()

      const block2 = await useMinerBlockFixture(node.chain, 2, accountA)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      expect(accountB.createdAt).toBeNull()
    })

    it('should not set account.createdAt if it is not null', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'accountA', { createdAt: null })

      expect(accountA.createdAt).toBeNull()

      const block2 = await useMinerBlockFixture(node.chain, 2, accountA)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      expect(accountA.createdAt?.sequence).toEqual(block2.header.sequence)

      const block3 = await useMinerBlockFixture(node.chain, 3, accountA)
      await node.chain.addBlock(block3)
      await node.wallet.scan()

      // see that createdAt is unchanged
      expect(accountA.createdAt?.sequence).toEqual(block2.header.sequence)
    })

    it('should skip updating accounts with scanningEnabled set to false', async () => {
      const { node } = await nodeTest.createSetup()
      const accountA: Account = await useAccountFixture(node.wallet, 'a')
      const accountB: Account = await useAccountFixture(node.wallet, 'b')
      await node.wallet.scan()

      await accountA.updateScanningEnabled(false)

      const block2 = await useMinerBlockFixture(node.chain, 2, undefined)
      await node.chain.addBlock(block2)
      const block3 = await useMinerBlockFixture(node.chain, 3, undefined)
      await node.chain.addBlock(block3)
      await node.wallet.scan()

      const aHead = await accountA.getHead()
      const bHead = await accountB.getHead()
      Assert.isNotNull(aHead)
      Assert.isNotNull(bHead)
      expect(aHead.sequence).toBe(1)
      expect(bHead.sequence).toBe(3)
    })

    it('should update transactions in the walletDb with blockHash and sequence null', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')
      const accountB = await useAccountFixture(node.wallet, 'b')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.scan()

      const { block: blockA2, transaction } = await useBlockWithTx(node, accountA, accountB)
      await expect(node.chain).toAddBlock(blockA2)

      await node.wallet.scan()

      let transactionValue = await accountA.getTransaction(transaction.hash())

      expect(transactionValue).toBeDefined()
      expect(transactionValue?.blockHash).toEqualHash(blockA2.header.hash)
      expect(transactionValue?.sequence).toEqual(blockA2.header.sequence)

      await node.chain.blockchainDb.db.transaction(async (tx) => {
        await node.chain.disconnect(blockA2, tx)
      })

      await node.wallet.scan()

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
      await node.wallet.scan()

      const { block: blockA2 } = await useBlockWithTx(node, accountA, accountB)
      await expect(node.chain).toAddBlock(blockA2)

      await node.wallet.scan()

      let accountAHead = await accountA.getHead()

      expect(accountAHead?.hash).toEqualHash(blockA2.header.hash)

      await node.chain.blockchainDb.db.transaction(async (tx) => {
        await node.chain.disconnect(blockA2, tx)
      })

      await node.wallet.scan()

      accountAHead = await accountA.getHead()

      expect(accountAHead?.hash).toEqualHash(blockA2.header.previousBlockHash)
    })

    it('should update the account unconfirmed balance', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')
      const accountB = await useAccountFixture(node.wallet, 'b')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.scan()

      const balanceBefore = await accountA.getUnconfirmedBalance(Asset.nativeId())
      expect(balanceBefore.unconfirmed).toEqual(2000000000n)

      const { block: blockA2 } = await useBlockWithTx(node, accountA, accountB, false)
      await expect(node.chain).toAddBlock(blockA2)

      await node.wallet.scan()

      const balanceAfterConnect = await accountA.getUnconfirmedBalance(Asset.nativeId())
      expect(balanceAfterConnect.unconfirmed).toEqual(1999999998n)

      await node.chain.blockchainDb.db.transaction(async (tx) => {
        await node.chain.disconnect(blockA2, tx)
      })

      await node.wallet.scan()

      const balanceAfterDisconnect = await accountA.getUnconfirmedBalance(Asset.nativeId())
      expect(balanceAfterDisconnect.unconfirmed).toEqual(2000000000n)
    })

    it('should skip disconnecting for accounts with scanningEnabled set to false', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')
      const accountB = await useAccountFixture(node.wallet, 'b')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      const blockA2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA2)

      await node.wallet.scan()

      let accountAHead = await accountA.getHead()
      let accountBHead = await accountB.getHead()

      expect(accountAHead?.hash).toEqualHash(blockA2.header.hash)
      expect(accountBHead?.hash).toEqualHash(blockA2.header.hash)

      await accountA.updateScanningEnabled(false)

      await node.chain.blockchainDb.db.transaction(async (tx) => {
        await node.chain.disconnect(blockA2, tx)
      })

      await node.wallet.scan()

      accountAHead = await accountA.getHead()
      accountBHead = await accountB.getHead()

      expect(accountAHead?.hash).toEqualHash(blockA2.header.hash)
      expect(accountBHead?.hash).toEqualHash(blockA2.header.previousBlockHash)
    })
  })

  describe('getAssetStatus', () => {
    it('should return the correct status for assets', async () => {
      const { node } = await nodeTest.createSetup()
      const account = await useAccountFixture(node.wallet)

      const mined = await useMinerBlockFixture(node.chain, 2, account)
      await expect(node.chain).toAddBlock(mined)
      await node.wallet.scan()

      const asset = new Asset(account.publicAddress, 'asset', 'metadata')
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
      await node.wallet.scan()
      assetValue = await node.wallet.walletDb.getAsset(account, asset.id())
      Assert.isNotUndefined(assetValue)
      expect(await node.wallet.getAssetStatus(account, assetValue)).toEqual(
        AssetStatus.CONFIRMED,
      )
      expect(
        await node.wallet.getAssetStatus(account, assetValue, { confirmations: 2 }),
      ).toEqual(AssetStatus.UNCONFIRMED)

      // Remove the head and check status
      jest.spyOn(account, 'getHead').mockResolvedValueOnce(null)
      expect(await node.wallet.getAssetStatus(account, assetValue)).toEqual(AssetStatus.UNKNOWN)
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

    it('should optionally set createdAt to null', async () => {
      const { node } = await nodeTest.createSetup()

      // create account so that wallet will scan transactions
      await useAccountFixture(node.wallet, 'a')

      const block2 = await useMinerBlockFixture(node.chain, 2)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      // create second account so that createdAt will be non-null
      let accountB: Account | null = await useAccountFixture(node.wallet, 'b')

      expect(accountB.createdAt?.sequence).toEqual(block2.header.sequence)

      await node.wallet.resetAccount(accountB, { resetCreatedAt: false })

      // load accountB from wallet again because resetAccount creates a new account instance
      accountB = node.wallet.getAccountByName(accountB.name)
      Assert.isNotNull(accountB)

      // createdAt should still refer to block2
      expect(accountB.createdAt?.sequence).toEqual(block2.header.sequence)

      // reset createdAt
      await node.wallet.resetAccount(accountB, { resetCreatedAt: true })

      accountB = node.wallet.getAccountByName(accountB.name)
      Assert.isNotNull(accountB)

      // createdAt should now be null
      expect(accountB.createdAt).toBeNull()
    })

    it('should optionally set scanningEnabled to true', async () => {
      const { node } = await nodeTest.createSetup()
      const account = await useAccountFixture(node.wallet, 'a')

      await account.updateScanningEnabled(false)

      await node.wallet.resetAccount(account, { resetScanningEnabled: true })

      // load accountB from wallet again because resetAccount creates a new account instance
      const newAccount = node.wallet.getAccountByName(account.name)
      Assert.isNotNull(newAccount)

      expect(newAccount.scanningEnabled).toBe(true)
    })

    it('should throw an error if the wallet is encrypted and the passphrase is not provided', async () => {
      const { node } = await nodeTest.createSetup()
      const passphrase = 'foo'

      const account = await useAccountFixture(node.wallet, 'A')
      await node.wallet.encrypt(passphrase)

      await expect(node.wallet.resetAccount(account)).rejects.toThrow()
    })

    it('save the encrypted account when the wallet is encrypted and passphrase is valid', async () => {
      const { node } = await nodeTest.createSetup()
      const passphrase = 'foo'

      const account = await useAccountFixture(node.wallet, 'A')
      await node.wallet.encrypt(passphrase)

      await node.wallet.unlock(passphrase)
      await node.wallet.resetAccount(account)

      const newAccount = node.wallet.getAccountByName(account.name)
      Assert.isNotNull(newAccount)

      const encryptedAccount = node.wallet.encryptedAccountById.get(newAccount.id)
      Assert.isNotUndefined(encryptedAccount)

      const masterKey = node.wallet['masterKey']
      Assert.isNotNull(masterKey)
      await masterKey.unlock(passphrase)
      const decryptedAccount = encryptedAccount.decrypt(masterKey)
      await node.wallet.lock()

      expect(decryptedAccount.name).toEqual(account.name)
      expect(decryptedAccount.spendingKey).toEqual(account.spendingKey)
    })
  })

  describe('getTransactionType', () => {
    it('should return miner type for minersFee transactions', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.scan()

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
      await node.wallet.scan()

      const { block: blockA2, transaction } = await useBlockWithTx(node, accountA, accountB)
      await expect(node.chain).toAddBlock(blockA2)
      await node.wallet.scan()

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
      await node.wallet.scan()

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
      await node.wallet.scan()

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
      await node.wallet.scan()

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
      await node.wallet.scan()

      const burnValue = BigInt(2)
      const burnBlock = await useBurnBlockFixture({
        node,
        account,
        asset,
        value: burnValue,
        sequence: 4,
      })
      await expect(node.chain).toAddBlock(burnBlock)
      await node.wallet.scan()

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
      await node.wallet.scan()

      const { block: blockA2, transaction } = await useBlockWithTx(node, accountA, accountB)
      await expect(node.chain).toAddBlock(blockA2)
      await node.wallet.scan()

      const transactionValue = await accountB.getTransaction(transaction.hash())

      Assert.isNotUndefined(transactionValue)

      await expect(node.wallet.getTransactionType(accountB, transactionValue)).resolves.toEqual(
        TransactionType.RECEIVE,
      )
    })
  })

  describe('encrypt', () => {
    it('saves encrypted blobs to disk and updates the wallet account fields', async () => {
      const { node } = nodeTest
      const passphrase = 'foo'

      const accountA = await useAccountFixture(node.wallet, 'A')
      const accountB = await useAccountFixture(node.wallet, 'B')

      expect(node.wallet.accounts).toHaveLength(2)
      expect(node.wallet.encryptedAccounts).toHaveLength(0)

      await node.wallet.encrypt(passphrase)

      expect(node.wallet.accounts).toHaveLength(0)
      expect(node.wallet.encryptedAccounts).toHaveLength(2)

      const masterKey = node.wallet['masterKey']
      Assert.isNotNull(masterKey)
      await masterKey.unlock(passphrase)

      const encryptedAccountA = node.wallet.encryptedAccountById.get(accountA.id)
      Assert.isNotUndefined(encryptedAccountA)
      const decryptedAccountA = encryptedAccountA.decrypt(masterKey)
      expect(accountA.serialize()).toMatchObject(decryptedAccountA.serialize())

      const encryptedAccountB = node.wallet.encryptedAccountById.get(accountB.id)
      Assert.isNotUndefined(encryptedAccountB)
      const decryptedAccountB = encryptedAccountB.decrypt(masterKey)
      expect(accountB.serialize()).toMatchObject(decryptedAccountB.serialize())
    })
  })

  describe('decrypt', () => {
    it('saves decrypted accounts to disk and updates the wallet account fields', async () => {
      const { node } = nodeTest
      const passphrase = 'foo'

      const accountA = await useAccountFixture(node.wallet, 'A')
      const accountB = await useAccountFixture(node.wallet, 'B')

      await node.wallet.encrypt(passphrase)
      expect(node.wallet.accounts).toHaveLength(0)
      expect(node.wallet.encryptedAccounts).toHaveLength(2)

      await node.wallet.decrypt(passphrase)
      expect(node.wallet.accounts).toHaveLength(2)
      expect(node.wallet.encryptedAccounts).toHaveLength(0)

      const decryptedAccountA = node.wallet.accountById.get(accountA.id)
      Assert.isNotUndefined(decryptedAccountA)
      expect(accountA.serialize()).toMatchObject(decryptedAccountA.serialize())

      const decryptedAccountB = node.wallet.accountById.get(accountB.id)
      Assert.isNotUndefined(decryptedAccountB)
      expect(accountB.serialize()).toMatchObject(decryptedAccountB.serialize())
    })

    it('fails with an invalid passphrase', async () => {
      const { node } = nodeTest
      const passphrase = 'foo'
      const invalidPassphrase = 'bar'

      await useAccountFixture(node.wallet, 'A')
      await useAccountFixture(node.wallet, 'B')

      await node.wallet.encrypt(passphrase)
      expect(node.wallet.accounts).toHaveLength(0)
      expect(node.wallet.encryptedAccounts).toHaveLength(2)

      await expect(node.wallet.decrypt(invalidPassphrase)).rejects.toThrow(
        AccountDecryptionFailedError,
      )

      expect(node.wallet.accounts).toHaveLength(0)
      expect(node.wallet.encryptedAccounts).toHaveLength(2)
    })
  })

  describe('lock', () => {
    it('does nothing if the wallet is decrypted', async () => {
      const { node } = nodeTest

      await useAccountFixture(node.wallet, 'A')
      await useAccountFixture(node.wallet, 'B')
      expect(node.wallet.accounts).toHaveLength(2)
      expect(node.wallet.encryptedAccounts).toHaveLength(0)

      await node.wallet.lock()
      expect(node.wallet.accounts).toHaveLength(2)
      expect(node.wallet.encryptedAccounts).toHaveLength(0)
    })

    it('clears decrypted accounts if the wallet is encrypted', async () => {
      const { node } = nodeTest
      const passphrase = 'foo'

      await useAccountFixture(node.wallet, 'A')
      await useAccountFixture(node.wallet, 'B')

      await node.wallet.encrypt(passphrase)
      expect(node.wallet.accounts).toHaveLength(0)
      expect(node.wallet.encryptedAccounts).toHaveLength(2)

      await node.wallet.unlock(passphrase)
      expect(node.wallet.accounts).toHaveLength(2)

      await node.wallet.lock()
      expect(node.wallet.accounts).toHaveLength(0)
      expect(node.wallet.locked).toBe(true)
    })
  })

  describe('unlock', () => {
    it('does nothing if the wallet is decrypted', async () => {
      const { node } = nodeTest

      await useAccountFixture(node.wallet, 'A')
      await useAccountFixture(node.wallet, 'B')
      expect(node.wallet.accounts).toHaveLength(2)
      expect(node.wallet.encryptedAccounts).toHaveLength(0)

      await node.wallet.unlock('foobar')
      expect(node.wallet.accounts).toHaveLength(2)
      expect(node.wallet.encryptedAccounts).toHaveLength(0)
    })

    it('does not unlock the wallet with an invalid passphrase', async () => {
      const { node } = nodeTest
      const passphrase = 'foo'
      const invalidPassphrase = 'bar'

      await useAccountFixture(node.wallet, 'A')
      await useAccountFixture(node.wallet, 'B')

      await node.wallet.encrypt(passphrase)
      expect(node.wallet.accounts).toHaveLength(0)
      expect(node.wallet.encryptedAccounts).toHaveLength(2)

      await expect(node.wallet.unlock(invalidPassphrase)).rejects.toThrow(
        AccountDecryptionFailedError,
      )
      expect(node.wallet.accounts).toHaveLength(0)
      expect(node.wallet.encryptedAccounts).toHaveLength(2)
      expect(node.wallet.locked).toBe(true)
    })

    it('saves decrypted accounts to memory with a valid passphrase', async () => {
      const { node } = nodeTest
      const passphrase = 'foo'

      await useAccountFixture(node.wallet, 'A')
      await useAccountFixture(node.wallet, 'B')

      await node.wallet.encrypt(passphrase)
      expect(node.wallet.accounts).toHaveLength(0)
      expect(node.wallet.encryptedAccounts).toHaveLength(2)

      await node.wallet.unlock(passphrase)
      expect(node.wallet.accounts).toHaveLength(2)
      expect(node.wallet.encryptedAccounts).toHaveLength(2)
      expect(node.wallet.locked).toBe(false)

      const masterKey = node.wallet['masterKey']
      Assert.isNotNull(masterKey)
      await masterKey.unlock(passphrase)

      for (const [id, account] of node.wallet.accountById.entries()) {
        const encryptedAccount = node.wallet.encryptedAccountById.get(id)
        Assert.isNotUndefined(encryptedAccount)
        const decryptedAccount = encryptedAccount.decrypt(masterKey)

        expect(account.serialize()).toMatchObject(decryptedAccount.serialize())
      }

      await node.wallet.lock()
    })
  })
})
