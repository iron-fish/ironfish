/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset, ASSET_ID_LENGTH, generateKey } from '@ironfish/rust-nodejs'
import { BufferMap, BufferSet } from 'buffer-map'
import { v4 as uuid } from 'uuid'
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { VerificationResultReason } from '../consensus'
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
import { AsyncUtils } from '../utils'
import { Account, TransactionStatus, TransactionType } from '../wallet'
import { AssetStatus, Wallet } from './wallet'

describe('Accounts', () => {
  const nodeTest = createNodeTest()

  it('should throw an error when chain processor head does not exist in chain', async () => {
    const { node, strategy } = nodeTest
    strategy.disableMiningReward()

    node.wallet['chainProcessor'].hash = Buffer.from('0')

    await expect(node.wallet.start()).rejects.toThrow()
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

    // nullifier should be defined
    Assert.isNotUndefined(forkSpendNoteHash)

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
    expect(await accountA.getNoteHash(forkSpendNullifier)).toBeUndefined()
  })

  describe('load', () => {
    it('should set chainProcessor hash and sequence', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.updateHead()

      expect(node.wallet.chainProcessor.hash).toEqualHash(blockA1.header.hash)
      expect(node.wallet.chainProcessor.sequence).toEqual(blockA1.header.sequence)

      node.wallet['unload']()

      expect(node.wallet.chainProcessor.hash).toBeNull()
      expect(node.wallet.chainProcessor.sequence).toBeNull()

      await node.wallet['load']()

      expect(node.wallet.chainProcessor.hash).toEqualHash(blockA1.header.hash)
      expect(node.wallet.chainProcessor.sequence).toEqual(blockA1.header.sequence)
    })
  })

  describe('start', () => {
    it('should reset account.createdAt if not in chain', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')

      // set accountA's createdAt block off the chain
      await accountA.updateCreatedAt({ hash: Buffer.alloc(32), sequence: 1 })

      jest.spyOn(node.wallet, 'scanTransactions').mockReturnValue(Promise.resolve())
      jest.spyOn(node.wallet, 'eventLoop').mockReturnValue(Promise.resolve())

      await node.wallet.start()

      expect(accountA.createdAt).toBeNull()
    })

    it('should not reset account.createdAt if its sequence is ahead of the chainProcessor', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')

      // set accountA's createdAt block off the chain
      await accountA.updateCreatedAt({ hash: Buffer.alloc(32), sequence: 10 })

      const resetAccountSpy = jest.spyOn(node.wallet, 'resetAccount')
      jest.spyOn(node.wallet, 'scanTransactions').mockReturnValue(Promise.resolve())
      jest.spyOn(node.wallet, 'eventLoop').mockReturnValue(Promise.resolve())

      await node.wallet.start()

      expect(resetAccountSpy).toHaveBeenCalledTimes(0)
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

      // Should update the chain processor to block2
      await wallet.scanTransactions()
      expect(wallet['chainProcessor']['hash']?.equals(block2.header.hash)).toBe(true)

      // Now with a reset chain processor should go to end of chain
      await wallet.reset()
      expect(wallet['chainProcessor']['hash']).toBe(null)

      // This should carry the chain processor to block2
      await wallet.scanTransactions()
      expect(wallet['chainProcessor']['hash']?.equals(block2.header.hash)).toBe(true)
    })

    it('should not scan if wallet is disabled', async () => {
      const { wallet, chain } = await nodeTest.createSetup({ config: { enableWallet: false } })
      await useAccountFixture(wallet)

      const block1 = await useMinerBlockFixture(chain)
      await expect(chain).toAddBlock(block1)

      expect(wallet['chainProcessor']['hash']).toBeNull()

      const connectSpy = jest.spyOn(wallet, 'connectBlock')

      await expect(wallet.shouldRescan()).resolves.toBe(false)

      await wallet.scanTransactions()

      expect(connectSpy).not.toHaveBeenCalled()
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
        createdAt: null,
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
        createdAt: null,
        ...key,
      }
      await node.wallet.importAccount(accountValue)
      const clone = { ...accountValue }
      clone.name = 'Different name'

      await expect(node.wallet.importAccount(clone)).rejects.toThrow(
        'Account already exists with provided view key(s)',
      )
    })

    it('should set createdAt if that block is in the chain', async () => {
      const { node: nodeA } = await nodeTest.createSetup()
      const { node: nodeB } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(nodeA.wallet, 'accountA', {
        setCreatedAt: false,
      })
      expect(accountA.createdAt).toBe(null)

      // create blocks and add them to both chains
      const block2 = await useMinerBlockFixture(nodeA.chain, 2)
      await nodeA.chain.addBlock(block2)
      await nodeB.chain.addBlock(block2)
      await nodeA.wallet.updateHead()
      const block3 = await useMinerBlockFixture(nodeA.chain, 3)
      await nodeA.chain.addBlock(block3)
      await nodeB.chain.addBlock(block3)
      await nodeA.wallet.updateHead()

      // create an account so that createdAt will be non-null
      const accountB = await useAccountFixture(nodeA.wallet, 'accountB')

      expect(accountB.createdAt?.hash).toEqualHash(block3.header.hash)
      expect(accountB.createdAt?.sequence).toEqual(3)

      const accountBImport = await nodeB.wallet.importAccount(accountB)

      expect(accountBImport.createdAt?.hash).toEqualHash(block3.header.hash)
      expect(accountBImport.createdAt?.sequence).toEqual(3)
    })

    it('should set createdAt to null if that block is not in the chain', async () => {
      const { node: nodeA } = await nodeTest.createSetup()
      const { node: nodeB } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(nodeA.wallet, 'accountA', {
        setCreatedAt: false,
      })
      expect(accountA.createdAt).toBe(null)

      // create blocks but only add them to one chain
      const block2 = await useMinerBlockFixture(nodeA.chain, 2)
      await nodeA.chain.addBlock(block2)
      await nodeA.wallet.updateHead()
      const block3 = await useMinerBlockFixture(nodeA.chain, 3)
      await nodeA.chain.addBlock(block3)
      await nodeA.wallet.updateHead()

      // create an account on nodeA so that createdAt will be non-null
      const accountB = await useAccountFixture(nodeA.wallet, 'accountB')

      expect(accountB.createdAt?.hash).toEqualHash(block3.header.hash)
      expect(accountB.createdAt?.sequence).toEqual(3)

      const accountBImport = await nodeB.wallet.importAccount(accountB)

      expect(accountBImport.createdAt).toBeNull()
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

      await node.wallet.updateHead()

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

      await node.wallet.updateHead()

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

      const expireTransactionSpy = jest.spyOn(accountA, 'expireTransaction')

      await node.wallet.expireTransactions(block3.header.sequence)

      expect(expireTransactionSpy).toHaveBeenCalledTimes(1)
      expect(expireTransactionSpy).toHaveBeenCalledWith(transaction)

      expireTransactionSpy.mockClear()

      await node.wallet.expireTransactions(block3.header.sequence)

      expect(expireTransactionSpy).toHaveBeenCalledTimes(0)
    })
  })

  describe('createAccount', () => {
    it('should set createdAt to the chain head', async () => {
      const node = nodeTest.node

      const block2 = await useMinerBlockFixture(node.chain, 2)
      await node.chain.addBlock(block2)

      const account = await node.wallet.createAccount('test')

      expect(account.createdAt?.hash).toEqualHash(block2.header.hash)
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

    it('should create transaction with a list of note hashes to spend', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'a')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      const blockA2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA2)
      const blockA3 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA3)

      await node.wallet.updateHead()

      const notes = [blockA2.minersFee.notes[0].hash()]

      const rawTransaction = await node.wallet.createTransaction({
        account: accountA,
        notes,
        outputs: [
          {
            publicAddress: '0d804ea639b2547d1cd612682bf99f7cad7aad6d59fd5457f61272defcd4bf5b',
            amount: 10n,
            memo: '',
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

      await node.wallet.updateHead()

      const notes = [blockA2.minersFee.notes[0].hash(), blockA3.minersFee.notes[0].hash()]

      const rawTransaction = await node.wallet.createTransaction({
        account: accountA,
        notes,
        outputs: [
          {
            publicAddress: '0d804ea639b2547d1cd612682bf99f7cad7aad6d59fd5457f61272defcd4bf5b',
            amount: 10n,
            memo: '',
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

      await node.wallet.updateHead()

      const notes = [blockA2.minersFee.notes[0].hash()]

      const rawTransaction = await node.wallet.createTransaction({
        account: accountA,
        notes,
        outputs: [
          {
            publicAddress: '0d804ea639b2547d1cd612682bf99f7cad7aad6d59fd5457f61272defcd4bf5b',
            amount: 2000000000n,
            memo: '',
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
      await nodeA.wallet.updateHead()
      await nodeB.wallet.updateHead()

      // add blockA3 to chain A
      const blockA3 = await useMinerBlockFixture(nodeA.chain)
      await expect(nodeA.chain).toAddBlock(blockA3)
      await nodeA.wallet.updateHead()

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
      await nodeB.wallet.updateHead()

      // reorg chain A
      await expect(nodeA.chain).toAddBlock(blockB3)
      await expect(nodeA.chain).toAddBlock(blockB4)
      expect(nodeA.chain.head.hash.equals(blockB4.header.hash)).toBe(true)
      await nodeA.wallet.updateHead()

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
        await wallet.updateHead()

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

      await node.wallet.rebroadcastTransactions(node.chain.head.sequence)

      expect(broadcastSpy).toHaveBeenCalledTimes(0)
    })
  })

  describe('mint', () => {
    describe('for an identifier not stored in the database', () => {
      it('throws a not found exception', async () => {
        const { node } = await nodeTest.createSetup()
        const account = await useAccountFixture(node.wallet)

        const assetId = Buffer.alloc(ASSET_ID_LENGTH)
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

        const asset = new Asset(account.publicAddress, 'mint-asset', 'metadata')

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

        const asset = new Asset(account.publicAddress, 'mint-asset', 'metadata')
        const mintValue = BigInt(10)
        const mintData = {
          creator: asset.creator().toString('hex'),
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

        expect(transaction.mints).toEqual([
          {
            asset: asset,
            value: mintValue,
            owner: asset.creator(),
            transferOwnershipTo: null,
          },
        ])
      })

      it('adds balance for the asset from the wallet', async () => {
        const { node } = await nodeTest.createSetup()
        const account = await useAccountFixture(node.wallet)

        const mined = await useMinerBlockFixture(node.chain, 2, account)
        await expect(node.chain).toAddBlock(mined)
        await node.wallet.updateHead()

        const asset = new Asset(account.publicAddress, 'mint-asset', 'metadata')
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

      const asset = new Asset(account.publicAddress, 'mint-asset', 'metadata')
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

      const asset = new Asset(account.publicAddress, 'mint-asset', 'metadata')
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

  describe('addPendingTransaction', () => {
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

      const transactions = await node.chain.getBlockTransactions(blockA2.header)
      await node.wallet.connectBlock(blockA2.header, transactions)

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

      const transactions = await node.chain.getBlockTransactions(blockA2.header)
      await node.wallet.connectBlock(blockA2.header, transactions)

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

      const transactions = await node.chain.getBlockTransactions(blockA2.header)
      await node.wallet.connectBlock(blockA2.header, transactions)

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

      const transactions = await node.chain.getBlockTransactions(blockA2.header)
      await node.wallet.connectBlock(blockA2.header, transactions)

      let accountAHead = await accountA.getHead()
      expect(accountAHead?.hash).toEqualHash(blockA2.header.hash)

      // Try to connect A2 again
      await node.wallet.connectBlock(blockA1.header, transactions)

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

      const transactionsA2 = await node.chain.getBlockTransactions(blockA2.header)
      await node.wallet.connectBlock(blockA2.header, transactionsA2)

      let accountAHead = await accountA.getHead()
      expect(accountAHead?.hash).toEqualHash(blockA2.header.hash)

      const updateHeadSpy = jest.spyOn(accountA, 'updateHead')

      // Try to connect A1 again
      const transactionsA1 = await node.chain.getBlockTransactions(blockA1.header)
      await node.wallet.connectBlock(blockA1.header, transactionsA1)

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
      const transactionsA3 = await node.chain.getBlockTransactions(blockA3.header)
      await node.wallet.connectBlock(blockA3.header, transactionsA3)

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

    it('should set null account.createdAt for the first on-chain transaction of an account', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'accountA', { setCreatedAt: false })

      expect(accountA.createdAt).toBeNull()

      const block2 = await useMinerBlockFixture(node.chain, 2, accountA)
      await node.chain.addBlock(block2)
      await node.wallet.updateHead()

      expect(accountA.createdAt?.hash).toEqualHash(block2.header.hash)
      expect(accountA.createdAt?.sequence).toEqual(block2.header.sequence)
    })

    it('should not set account.createdAt if the account has no transaction on the block', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'accountA', { setCreatedAt: false })
      const accountB = await useAccountFixture(node.wallet, 'accountB', { setCreatedAt: false })

      expect(accountA.createdAt).toBeNull()
      expect(accountB.createdAt).toBeNull()

      const block2 = await useMinerBlockFixture(node.chain, 2, accountA)
      await node.chain.addBlock(block2)
      await node.wallet.updateHead()

      expect(accountB.createdAt).toBeNull()
    })

    it('should not set account.createdAt if it is not null', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'accountA', { setCreatedAt: false })

      expect(accountA.createdAt).toBeNull()

      const block2 = await useMinerBlockFixture(node.chain, 2, accountA)
      await node.chain.addBlock(block2)
      await node.wallet.updateHead()

      expect(accountA.createdAt?.hash).toEqualHash(block2.header.hash)
      expect(accountA.createdAt?.sequence).toEqual(block2.header.sequence)

      const block3 = await useMinerBlockFixture(node.chain, 3, accountA)
      await node.chain.addBlock(block3)
      await node.wallet.updateHead()

      // see that createdAt is unchanged
      expect(accountA.createdAt?.hash).toEqualHash(block2.header.hash)
      expect(accountA.createdAt?.sequence).toEqual(block2.header.sequence)
    })

    it('should skip decryption for accounts with createdAt later than the block header', async () => {
      const { node: nodeA } = await nodeTest.createSetup()

      let accountA: Account | null = await useAccountFixture(nodeA.wallet, 'a')

      const block2 = await useMinerBlockFixture(nodeA.chain, 2, undefined)
      await nodeA.chain.addBlock(block2)
      await nodeA.wallet.updateHead()
      const block3 = await useMinerBlockFixture(nodeA.chain, 2, undefined)
      await nodeA.chain.addBlock(block3)
      await nodeA.wallet.updateHead()

      // create second account with createdAt at block 3
      const accountB = await useAccountFixture(nodeA.wallet, 'b')

      expect(accountB.createdAt).not.toBeNull()
      expect(accountB.createdAt?.hash).toEqualHash(block3.header.hash)
      expect(accountB.createdAt?.sequence).toEqual(block3.header.sequence)

      // reset wallet
      await nodeA.wallet.reset()

      // account instances will have changed after reset, so re-load accountA
      accountA = nodeA.wallet.getAccountByName('a')
      Assert.isNotNull(accountA)

      const transactions = await nodeA.chain.getBlockTransactions(nodeA.chain.genesis)
      await nodeA.wallet.connectBlock(nodeA.chain.genesis, transactions)

      const decryptSpy = jest.spyOn(nodeA.wallet, 'decryptNotes')

      // reconnect block2
      const transactions2 = await nodeA.chain.getBlockTransactions(block2.header)
      await nodeA.wallet.connectBlock(block2.header, transactions2)

      // see that decryption was skipped for accountB
      expect(decryptSpy).toHaveBeenCalledTimes(1)
      expect(decryptSpy.mock.lastCall?.[3]).toEqual([accountA])
    })
  })

  describe('getAssetStatus', () => {
    it('should return the correct status for assets', async () => {
      const { node } = await nodeTest.createSetup()
      const account = await useAccountFixture(node.wallet)

      const mined = await useMinerBlockFixture(node.chain, 2, account)
      await expect(node.chain).toAddBlock(mined)
      await node.wallet.updateHead()

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

      await node.chain.blockchainDb.db.transaction(async (tx) => {
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

      await node.chain.blockchainDb.db.transaction(async (tx) => {
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

      await node.chain.blockchainDb.db.transaction(async (tx) => {
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
      const transactions = await node.chain.getBlockTransactions(blockA1.header)
      await node.wallet.disconnectBlock(blockA1.header, transactions)

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
      await node.chain.addBlock(blockA2)

      let accountAHead = await accountA.getHead()
      expect(accountAHead?.hash).toEqualHash(blockA1.header.hash)

      const updateHeadSpy = jest.spyOn(accountA, 'updateHead')

      // Try to disconnect blockA2
      const transactions = await node.chain.getBlockTransactions(blockA2.header)
      await node.wallet.disconnectBlock(blockA2.header, transactions)

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
      const transactions = await node.chain.getBlockTransactions(blockA1.header)
      await node.wallet.disconnectBlock(blockA1.header, transactions)

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

      const transactions = await node.chain.getBlockTransactions(blockA2.header)
      await node.wallet.disconnectBlock(blockA2.header, transactions)

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

      const transactions = await node.chain.getBlockTransactions(blockA3.header)
      await node.wallet.disconnectBlock(blockA3.header, transactions)

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

    it('should update an account createdAt field if that block is disconnected', async () => {
      const { node } = await nodeTest.createSetup()

      // create an account so that wallet will scan transactions
      await useAccountFixture(node.wallet, 'accountA')

      const block2 = await useMinerBlockFixture(node.chain, 2)
      await node.chain.addBlock(block2)
      await node.wallet.updateHead()

      const block3 = await useMinerBlockFixture(node.chain, 3)
      await node.chain.addBlock(block3)
      await node.wallet.updateHead()

      // create a second account with createdAt referencing block3
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      expect(accountB.createdAt).not.toBeNull()
      expect(accountB.createdAt?.hash).toEqualHash(block3.header.hash)
      expect(accountB.createdAt?.sequence).toEqual(block3.header.sequence)

      // disconnect block3 so that accountB's createdAt is updated
      const transactions = await node.chain.getBlockTransactions(block3.header)
      await node.wallet.disconnectBlock(block3.header, transactions)

      // accountB.createdAt should now reference block2, the previous block from block3
      expect(accountB.createdAt?.hash).toEqualHash(block2.header.hash)
      expect(accountB.createdAt?.sequence).toEqual(block2.header.sequence)
    })

    it('should reset createdAt to the fork point on a fork', async () => {
      const { node: nodeA } = await nodeTest.createSetup()
      const { node: nodeB } = await nodeTest.createSetup()

      // create account so that wallet scans transactions
      await useAccountFixture(nodeA.wallet, 'a1')

      // create block and add to both chains
      const blockA1 = await useMinerBlockFixture(nodeA.chain, undefined)
      await expect(nodeA.chain).toAddBlock(blockA1)
      await expect(nodeB.chain).toAddBlock(blockA1)
      await nodeA.wallet.updateHead()

      // create blocks but don't add to nodeB
      const blockA2 = await useMinerBlockFixture(nodeA.chain, undefined)
      await expect(nodeA.chain).toAddBlock(blockA2)
      await nodeA.wallet.updateHead()

      const blockA3 = await useMinerBlockFixture(nodeA.chain, undefined)
      await expect(nodeA.chain).toAddBlock(blockA3)
      await nodeA.wallet.updateHead()

      // create accountA2 at blockA3
      const accountA2 = await useAccountFixture(nodeA.wallet, 'a2')

      expect(accountA2.createdAt?.hash).toEqualHash(blockA3.header.hash)
      expect(accountA2.createdAt?.sequence).toEqual(blockA3.header.sequence)

      // create fork on nodeB
      const blockB2 = await useMinerBlockFixture(nodeB.chain, undefined)
      await expect(nodeB.chain).toAddBlock(blockB2)
      const blockB3 = await useMinerBlockFixture(nodeB.chain, undefined)
      await expect(nodeB.chain).toAddBlock(blockB3)
      const blockB4 = await useMinerBlockFixture(nodeB.chain, undefined)
      await expect(nodeB.chain).toAddBlock(blockB4)

      // re-org
      await expect(nodeA.chain).toAddBlock(blockB2)
      await expect(nodeA.chain).toAddBlock(blockB3)
      await expect(nodeA.chain).toAddBlock(blockB4)
      expect(nodeA.chain.head.hash.equals(blockB4.header.hash)).toBe(true)
      await nodeA.wallet.updateHead()

      // accountA2.createdAt should be reset to blockA1, the point of the fork
      expect(accountA2.createdAt?.hash).toEqualHash(blockA1.header.hash)
      expect(accountA2.createdAt?.sequence).toEqual(blockA1.header.sequence)
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
      await node.wallet.updateHead()

      // create second account so that createdAt will be non-null
      let accountB: Account | null = await useAccountFixture(node.wallet, 'b')

      expect(accountB.createdAt?.hash).toEqualHash(block2.header.hash)
      expect(accountB.createdAt?.sequence).toEqual(block2.header.sequence)

      await node.wallet.resetAccount(accountB, { resetCreatedAt: false })

      // load accountB from wallet again because resetAccount creates a new account instance
      accountB = node.wallet.getAccountByName(accountB.name)
      Assert.isNotNull(accountB)

      // createdAt should still refer to block2
      expect(accountB.createdAt?.hash).toEqualHash(block2.header.hash)
      expect(accountB.createdAt?.sequence).toEqual(block2.header.sequence)

      // reset createdAt
      await node.wallet.resetAccount(accountB, { resetCreatedAt: true })

      accountB = node.wallet.getAccountByName(accountB.name)
      Assert.isNotNull(accountB)

      // createdAt should now be null
      expect(accountB.createdAt).toBeNull()
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

  describe('shouldDecryptForAccount', () => {
    it('should return true for an account with null createdAt', async () => {
      const { node } = nodeTest

      const account = await useAccountFixture(node.wallet)

      await account.updateCreatedAt(null)

      const block = await useMinerBlockFixture(node.chain, 2)

      await expect(node.wallet.shouldDecryptForAccount(block.header, account)).resolves.toBe(
        true,
      )
    })

    it('should return true for an account with createdAt earlier than the header', async () => {
      const { node } = nodeTest

      const account = await useAccountFixture(node.wallet)

      await account.updateCreatedAt({ hash: Buffer.alloc(32), sequence: 1 })

      const block = await useMinerBlockFixture(node.chain, 2)

      await expect(node.wallet.shouldDecryptForAccount(block.header, account)).resolves.toBe(
        true,
      )
    })

    it('should return false for an account created after the header', async () => {
      const { node } = nodeTest

      const account = await useAccountFixture(node.wallet)

      await account.updateCreatedAt({ hash: Buffer.alloc(32), sequence: 3 })

      const block = await useMinerBlockFixture(node.chain, 2)

      await expect(node.wallet.shouldDecryptForAccount(block.header, account)).resolves.toBe(
        false,
      )
    })

    it('should return true for an account created at the header', async () => {
      const { node } = nodeTest

      const account = await useAccountFixture(node.wallet)

      const block = await useMinerBlockFixture(node.chain, 2)

      await account.updateCreatedAt(block.header)

      await expect(node.wallet.shouldDecryptForAccount(block.header, account)).resolves.toBe(
        true,
      )
    })

    it('should set the account createdAt if the account was created on a different chain', async () => {
      const { node } = nodeTest

      const account = await useAccountFixture(node.wallet)

      // set createdAt at fake block at sequence 2
      await account.updateCreatedAt({ hash: Buffer.alloc(32), sequence: 2 })

      const resetAccount = jest.spyOn(node.wallet, 'resetAccount')

      const block = await useMinerBlockFixture(node.chain, 2)

      await expect(node.wallet.shouldDecryptForAccount(block.header, account)).resolves.toBe(
        false,
      )

      expect(resetAccount).not.toHaveBeenCalled()

      expect(account.createdAt).toBeNull()
    })
  })

  describe('updateHead', () => {
    it('should update until the chainProcessor reaches the chain head', async () => {
      const { node } = await nodeTest.createSetup()

      // create an account so that the wallet will sync
      await useAccountFixture(node.wallet, 'a')

      // update wallet to genesis block
      await node.wallet.updateHead()

      const block2 = await useMinerBlockFixture(node.chain, undefined)
      await expect(node.chain).toAddBlock(block2)
      const block3 = await useMinerBlockFixture(node.chain, undefined)
      await expect(node.chain).toAddBlock(block3)

      expect(node.chain.head.hash).toEqualHash(block3.header.hash)
      expect(node.wallet.chainProcessor.hash).toEqualHash(node.chain.genesis.hash)

      // set max syncing queue to 1 so that wallet only fetches one block at a time
      node.wallet.chainProcessor.maxQueueSize = 1

      const updateSpy = jest.spyOn(node.wallet.chainProcessor, 'update')

      await node.wallet.updateHead()

      // chainProcessor should sync all the way to head with one call to updateHead
      expect(node.wallet.chainProcessor.hash).toEqualHash(node.chain.head.hash)

      // one call for each block and a third to find that hash doesn't change
      expect(updateSpy).toHaveBeenCalledTimes(3)
    })
  })
})
