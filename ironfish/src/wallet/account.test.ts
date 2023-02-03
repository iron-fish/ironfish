/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { BufferMap } from 'buffer-map'
import { Assert } from '../assert'
import {
  createNodeTest,
  useAccountFixture,
  useBlockWithTx,
  useMinerBlockFixture,
  useMintBlockFixture,
  useTxFixture,
} from '../testUtilities'
import { AsyncUtils } from '../utils/async'
import { Account } from './account'
import { BalanceValue } from './walletdb/balanceValue'

describe('Accounts', () => {
  const nodeTest = createNodeTest()

  async function accountHasSequenceToNoteHash(
    account: Account,
    sequence: number,
    noteHash: Buffer,
  ): Promise<boolean> {
    const entry = await account['walletDb'].sequenceToNoteHash.get([
      account.prefix,
      [sequence, noteHash],
    ])

    return entry !== undefined
  }

  async function accountHasNonChainNoteHash(
    account: Account,
    noteHash: Buffer,
  ): Promise<boolean> {
    const entry = await account['walletDb'].nonChainNoteHashes.get([account.prefix, noteHash])

    return entry !== undefined
  }

  it('should store notes at sequence', async () => {
    const { node } = nodeTest

    const account = await useAccountFixture(node.wallet, 'accountA')

    const block1 = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
    await expect(node.chain).toAddBlock(block1)

    const block2 = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
    await expect(node.chain).toAddBlock(block2)

    // From block1
    const note1Encrypted = Array.from(block1.notes())[0]
    const note1 = note1Encrypted.decryptNoteForOwner(account.incomingViewKey)
    Assert.isNotUndefined(note1)

    // From block2
    const note2Encrypted = Array.from(block2.notes())[0]
    const note2 = note2Encrypted.decryptNoteForOwner(account.incomingViewKey)
    Assert.isNotUndefined(note2)

    let noteHashesNotOnChain = await AsyncUtils.materialize(
      node.wallet.walletDb.loadNoteHashesNotOnChain(account),
    )
    let notesInSequence = await AsyncUtils.materialize(
      node.wallet.walletDb.loadNotesInSequenceRange(account, 0, 3),
    )
    let notesInSequence2 = await AsyncUtils.materialize(
      node.wallet.walletDb.loadNotesInSequenceRange(account, 1, 1),
    )
    let notesInSequence3 = await AsyncUtils.materialize(
      node.wallet.walletDb.loadNotesInSequenceRange(account, 2, 2),
    )

    expect(noteHashesNotOnChain).toHaveLength(2)
    expect(noteHashesNotOnChain).toContainEqual(note1Encrypted.hash())
    expect(noteHashesNotOnChain).toContainEqual(note2Encrypted.hash())
    expect(notesInSequence).toHaveLength(0)
    expect(notesInSequence2).toHaveLength(0)
    expect(notesInSequence3).toHaveLength(0)

    await node.wallet.updateHead()

    noteHashesNotOnChain = await AsyncUtils.materialize(
      node.wallet.walletDb.loadNoteHashesNotOnChain(account),
    )
    notesInSequence = await AsyncUtils.materialize(
      node.wallet.walletDb.loadNotesInSequenceRange(account, 0, 4),
    )
    notesInSequence2 = await AsyncUtils.materialize(
      node.wallet.walletDb.loadNotesInSequenceRange(account, 2, 2),
    )
    notesInSequence3 = await AsyncUtils.materialize(
      node.wallet.walletDb.loadNotesInSequenceRange(account, 3, 3),
    )
    const notesInSequenceAfter = AsyncUtils.materialize(
      node.wallet.walletDb.loadNotesInSequenceRange(account, 4, 10),
    )

    expect(noteHashesNotOnChain).toHaveLength(0)
    expect(notesInSequence2).toHaveLength(1)
    expect(notesInSequence2).toContainEqual(
      expect.objectContaining({
        hash: note1Encrypted.hash(),
      }),
    )

    expect(notesInSequence3).toHaveLength(1)
    expect(notesInSequence3).toContainEqual(
      expect.objectContaining({
        hash: note2Encrypted.hash(),
      }),
    )

    // Check the notes are returned and in order
    expect(notesInSequence).toHaveLength(2)
    expect(notesInSequence[0].hash).toEqual(note1Encrypted.hash())
    expect(notesInSequence[1].hash).toEqual(note2Encrypted.hash())

    // And that no notes are returned in a range where there are none
    await expect(notesInSequenceAfter).resolves.toHaveLength(0)
  })

  it('should expire transactions', async () => {
    const { node } = nodeTest

    const account = await useAccountFixture(node.wallet, 'accountA')

    const block = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
    const tx = block.transactions[0]
    const noteEncrypted = Array.from(block.notes())[0]
    const note = noteEncrypted.decryptNoteForOwner(account.incomingViewKey)
    Assert.isNotUndefined(note)

    await expect(AsyncUtils.materialize(account.getNotes())).resolves.toHaveLength(1)

    await expect(
      AsyncUtils.materialize(node.wallet.walletDb.loadNoteHashesNotOnChain(account)),
    ).resolves.toHaveLength(1)

    await expect(account.getBalance(Asset.nativeId(), 1)).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    await account.expireTransaction(tx)

    await expect(AsyncUtils.materialize(account.getNotes())).resolves.toHaveLength(0)

    await expect(
      AsyncUtils.materialize(node.wallet.walletDb.loadNoteHashesNotOnChain(account)),
    ).resolves.toHaveLength(0)

    await expect(account.getBalance(Asset.nativeId(), 1)).resolves.toMatchObject({
      confirmed: BigInt(0),
      unconfirmed: BigInt(0),
    })

    // record of expired transaction is preserved
    await expect(account.getTransaction(tx.hash())).resolves.toBeDefined()
  })

  describe('loadPendingTransactions', () => {
    it('should load pending transactions', async () => {
      const { node } = nodeTest

      const account = await useAccountFixture(node.wallet, 'accountA')

      const block1 = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
      await node.chain.addBlock(block1)
      await node.wallet.updateHead()

      // create pending transaction
      await useTxFixture(node.wallet, account, account, undefined, undefined, 4)

      const pendingTransactions = await AsyncUtils.materialize(
        account.getPendingTransactions(node.chain.head.sequence),
      )

      expect(pendingTransactions.length).toEqual(1)
    })

    it('should load pending transactions with large expiration seqeunces', async () => {
      const { node } = nodeTest

      const account = await useAccountFixture(node.wallet, 'accountA')

      const block1 = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
      await node.chain.addBlock(block1)
      await node.wallet.updateHead()

      // create pending transaction
      await useTxFixture(node.wallet, account, account, undefined, undefined, 2 ** 32 - 2)

      const pendingTransactions = await AsyncUtils.materialize(
        account.getPendingTransactions(node.chain.head.sequence),
      )

      expect(pendingTransactions.length).toEqual(1)
    })

    it('should load transactions with no expiration', async () => {
      const { node } = nodeTest

      const account = await useAccountFixture(node.wallet, 'accountA')

      const block1 = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
      await node.chain.addBlock(block1)
      await node.wallet.updateHead()

      // create transaction with no expiration
      await useTxFixture(node.wallet, account, account)

      const pendingTransactions = await AsyncUtils.materialize(
        account.getPendingTransactions(node.chain.head.sequence),
      )

      expect(pendingTransactions.length).toEqual(1)
    })

    it('should not load expired transactions', async () => {
      const { node } = nodeTest

      const account = await useAccountFixture(node.wallet, 'accountA')

      const block1 = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
      await node.chain.addBlock(block1)
      await node.wallet.updateHead()

      // create expired transaction
      await useTxFixture(node.wallet, account, account, undefined, undefined, 1)

      const pendingTransactions = await AsyncUtils.materialize(
        account.getPendingTransactions(node.chain.head.sequence),
      )

      expect(pendingTransactions.length).toEqual(0)
    })
  })

  describe('getUnconfirmedBalances', () => {
    it('returns a mapping of asset identifiers to balances for an account', async () => {
      const { node } = nodeTest

      const account = await useAccountFixture(node.wallet, 'account')
      const nativeBalance = {
        unconfirmed: BigInt(1),
        blockHash: null,
        sequence: null,
      }
      const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')
      const mintedAssetBalance = {
        unconfirmed: BigInt(7),
        blockHash: null,
        sequence: null,
      }

      await account.saveUnconfirmedBalance(Asset.nativeId(), nativeBalance)
      await account.saveUnconfirmedBalance(asset.id(), mintedAssetBalance)

      const balances = await account.getUnconfirmedBalances()
      const expectedBalances = new BufferMap<BalanceValue>([
        [Asset.nativeId(), nativeBalance],
        [asset.id(), mintedAssetBalance],
      ])

      expect(balances.size).toBe(expectedBalances.size)
      for (const key of balances.toKeys()) {
        expect(balances.get(key)).toEqual(expectedBalances.get(key))
      }
    })
  })

  describe('addPendingTransaction', () => {
    it('should create new decrypted notes marked as off chain', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const addPendingSpy = jest.spyOn(accountA, 'addPendingTransaction')

      const block1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block1)
      await node.wallet.updateHead()

      const transaction = await useTxFixture(node.wallet, accountA, accountA)

      expect(addPendingSpy).toHaveBeenCalled()

      // transaction from A -> A, so all notes belong to A
      for (const note of transaction.notes) {
        const decryptedNote = await accountA.getDecryptedNote(note.hash())

        expect(decryptedNote).toBeDefined()

        const nonChainIndex = await accountA['walletDb'].nonChainNoteHashes.get([
          accountA.prefix,
          note.hash(),
        ])

        expect(nonChainIndex).toBeDefined()
      }
    })

    it('should mark notes from spends as spent', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const addPendingSpy = jest.spyOn(accountA, 'addPendingTransaction')

      const block1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block1)
      await node.wallet.updateHead()

      const transaction = await useTxFixture(node.wallet, accountA, accountA)

      expect(addPendingSpy).toHaveBeenCalled()

      for (const spend of transaction.spends) {
        const spentNoteHash = await accountA.getNoteHash(spend.nullifier)

        Assert.isNotNull(spentNoteHash)

        const spentNote = await accountA.getDecryptedNote(spentNoteHash)

        Assert.isNotUndefined(spentNote)

        expect(spentNote.spent).toBeTruthy()
      }
    })

    it('should add transactions to pendingTransactionHashes', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const addPendingSpy = jest.spyOn(accountA, 'addPendingTransaction')

      const block1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block1)
      await node.wallet.updateHead()

      const transaction = await useTxFixture(node.wallet, accountA, accountA)

      expect(addPendingSpy).toHaveBeenCalled()

      const pendingHashEntry = await accountA['walletDb'].pendingTransactionHashes.get([
        accountA.prefix,
        [transaction.expiration(), transaction.hash()],
      ])

      expect(pendingHashEntry).toBeDefined()
    })
  })

  describe('connectTransaction', () => {
    it('should create decrypted notes marked as on chain', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const connectSpy = jest.spyOn(accountA, 'connectTransaction')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.updateHead()

      const transaction = await useTxFixture(node.wallet, accountA, accountA)
      const block3 = await useMinerBlockFixture(node.chain, 3, accountA, undefined, [
        transaction,
      ])
      await node.chain.addBlock(block3)
      await node.wallet.updateHead()

      expect(connectSpy).toHaveBeenCalled()

      // transaction from A -> A, so all notes belong to A
      for (const note of transaction.notes) {
        const decryptedNote = await accountA.getDecryptedNote(note.hash())

        expect(decryptedNote).toBeDefined()

        const nonChainIndex = await accountA['walletDb'].nonChainNoteHashes.get([
          accountA.prefix,
          note.hash(),
        ])

        expect(nonChainIndex).toBeUndefined()

        expect(decryptedNote?.nullifier).toBeDefined()

        const sequenceIndex = await accountA['walletDb'].sequenceToNoteHash.get([
          accountA.prefix,
          [3, note.hash()],
        ])

        expect(sequenceIndex).toBeDefined()
      }
    })

    it('should mark notes from spends as spent', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const connectSpy = jest.spyOn(accountA, 'connectTransaction')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.updateHead()

      const transaction = await useTxFixture(node.wallet, accountA, accountA)
      const block3 = await useMinerBlockFixture(node.chain, 3, accountA, undefined, [
        transaction,
      ])
      await node.chain.addBlock(block3)
      await node.wallet.updateHead()

      expect(connectSpy).toHaveBeenCalled()

      for (const spend of transaction.spends) {
        const spentNoteHash = await accountA.getNoteHash(spend.nullifier)

        Assert.isNotNull(spentNoteHash)

        const spentNote = await accountA.getDecryptedNote(spentNoteHash)

        Assert.isNotUndefined(spentNote)

        expect(spentNote.spent).toBeTruthy()
      }
    })

    it('should remove transactions from pendingTransactionHashes', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const connectSpy = jest.spyOn(accountA, 'connectTransaction')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.updateHead()

      const transaction = await useTxFixture(node.wallet, accountA, accountA)
      const block3 = await useMinerBlockFixture(node.chain, 3, accountA, undefined, [
        transaction,
      ])
      await node.chain.addBlock(block3)
      await node.wallet.updateHead()

      expect(connectSpy).toHaveBeenCalled()

      const pendingHashEntry = await accountA['walletDb'].pendingTransactionHashes.get([
        accountA.prefix,
        [transaction.expiration(), transaction.hash()],
      ])

      expect(pendingHashEntry).toBeUndefined()
    })

    it('should add transactions to sequenceToTransactionHash', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const connectSpy = jest.spyOn(accountA, 'connectTransaction')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.updateHead()

      const transaction = await useTxFixture(node.wallet, accountA, accountA)
      const block3 = await useMinerBlockFixture(node.chain, 3, accountA, undefined, [
        transaction,
      ])
      await node.chain.addBlock(block3)
      await node.wallet.updateHead()

      expect(connectSpy).toHaveBeenCalled()

      const sequenceIndexEntry = await node.wallet.walletDb.sequenceToTransactionHash.get([
        accountA.prefix,
        [block3.header.sequence, transaction.hash()],
      ])

      expect(sequenceIndexEntry).toBeNull()
    })
  })

  describe('disconnectTransaction', () => {
    it('should revert decrypted notes to be marked as off chain', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.updateHead()

      const transaction = await useTxFixture(node.wallet, accountA, accountA)
      const block3 = await useMinerBlockFixture(node.chain, 3, accountA, undefined, [
        transaction,
      ])
      await node.chain.addBlock(block3)
      await node.wallet.updateHead()

      // transaction from A -> A, so all notes belong to A
      for (const note of transaction.notes) {
        const decryptedNote = await accountA.getDecryptedNote(note.hash())

        expect(decryptedNote).toBeDefined()

        expect(decryptedNote?.nullifier).toBeDefined()

        const sequenceIndex = await accountA['walletDb'].sequenceToNoteHash.get([
          accountA.prefix,
          [3, note.hash()],
        ])

        expect(sequenceIndex).toBeDefined()
      }

      // disconnect transaction
      await accountA.disconnectTransaction(block3.header, transaction)

      for (const note of transaction.notes) {
        const decryptedNote = await accountA.getDecryptedNote(note.hash())

        expect(decryptedNote).toBeDefined()

        expect(decryptedNote?.nullifier).toBeNull()

        const nonChainIndex = await accountA['walletDb'].nonChainNoteHashes.get([
          accountA.prefix,
          note.hash(),
        ])

        expect(nonChainIndex).toBeDefined()

        const sequenceIndex = await accountA['walletDb'].sequenceToNoteHash.get([
          accountA.prefix,
          [3, note.hash()],
        ])

        expect(sequenceIndex).toBeUndefined()
      }
    })

    it('should not change notes from spends to unspent', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.updateHead()

      const transaction = await useTxFixture(node.wallet, accountA, accountA)
      const block3 = await useMinerBlockFixture(node.chain, 3, accountA, undefined, [
        transaction,
      ])
      await node.chain.addBlock(block3)
      await node.wallet.updateHead()

      for (const spend of transaction.spends) {
        const spentNoteHash = await accountA.getNoteHash(spend.nullifier)

        Assert.isNotNull(spentNoteHash)

        const spentNote = await accountA.getDecryptedNote(spentNoteHash)

        Assert.isNotUndefined(spentNote)

        expect(spentNote.spent).toBeTruthy()
      }

      // disconnect transaction
      await accountA.disconnectTransaction(block3.header, transaction)

      for (const spend of transaction.spends) {
        const spentNoteHash = await accountA.getNoteHash(spend.nullifier)

        Assert.isNotNull(spentNoteHash)

        const spentNote = await accountA.getDecryptedNote(spentNoteHash)

        Assert.isNotUndefined(spentNote)

        // spends should still be marked as spent since transactions are pending
        expect(spentNote.spent).toBeTruthy()
      }
    })

    it('should restore transactions into pendingTransactionHashes', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.updateHead()

      const transaction = await useTxFixture(node.wallet, accountA, accountA)
      const block3 = await useMinerBlockFixture(node.chain, 3, accountA, undefined, [
        transaction,
      ])
      await node.chain.addBlock(block3)
      await node.wallet.updateHead()

      let pendingHashEntry = await accountA['walletDb'].pendingTransactionHashes.get([
        accountA.prefix,
        [transaction.expiration(), transaction.hash()],
      ])

      expect(pendingHashEntry).toBeUndefined()

      // disconnect transaction
      await accountA.disconnectTransaction(block3.header, transaction)

      pendingHashEntry = await accountA['walletDb'].pendingTransactionHashes.get([
        accountA.prefix,
        [transaction.expiration(), transaction.hash()],
      ])

      expect(pendingHashEntry).toBeDefined()
    })

    it('should delete entries from sequenceToNoteHash', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.updateHead()

      const transaction = await useTxFixture(node.wallet, accountA, accountA)
      const block3 = await useMinerBlockFixture(node.chain, 3, accountA, undefined, [
        transaction,
      ])
      await node.chain.addBlock(block3)
      await node.wallet.updateHead()

      let sequenceIndexEntry = await accountA['walletDb'].sequenceToTransactionHash.get([
        accountA.prefix,
        [block3.header.sequence, transaction.hash()],
      ])

      expect(sequenceIndexEntry).toBeDefined()

      // disconnect transaction
      await accountA.disconnectTransaction(block3.header, transaction)

      sequenceIndexEntry = await accountA['walletDb'].sequenceToTransactionHash.get([
        accountA.prefix,
        [block3.header.sequence, transaction.hash()],
      ])

      expect(sequenceIndexEntry).toBeUndefined()
    })
  })

  describe('deleteTransaction', () => {
    it('should delete transaction record from the database', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.updateHead()

      const transaction = block2.transactions[0]

      // accountA has the transaction
      await expect(accountA.getTransaction(transaction.hash())).resolves.toBeDefined()

      // transaction is not marked as pending
      await expect(accountA.hasPendingTransaction(transaction.hash())).resolves.toEqual(false)

      // delete the transaction
      await accountA.deleteTransaction(transaction)

      // record removed from accountA
      await expect(accountA.getTransaction(transaction.hash())).resolves.toBeUndefined()
    })

    it('should delete output note records from the database', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.updateHead()

      const transaction = block2.transactions[0]

      // accountA has one note for the transaction
      let notes = await accountA.getTransactionNotes(transaction)

      expect(notes.length).toEqual(1)

      const noteHash = notes[0].hash

      // the note has a nullifier stored in nullifierToNoteHashes
      const nullifier = notes[0].nullifier

      Assert.isNotNull(nullifier)

      await expect(accountA.getNoteHash(nullifier)).resolves.toEqual(noteHash)

      // the note is stored in sequenceToNoteHash
      await expect(accountHasSequenceToNoteHash(accountA, 2, noteHash)).resolves.toBe(true)

      // but not nonChainNoteHashes
      await expect(accountHasNonChainNoteHash(accountA, noteHash)).resolves.toBe(false)

      // delete the transaction
      await accountA.deleteTransaction(transaction)

      // accountA has no notes for the transaction
      notes = await accountA.getTransactionNotes(transaction)

      expect(notes.length).toEqual(0)

      // nullifierToNoteHash entry removed
      await expect(accountA.getNoteHash(nullifier)).resolves.toBeNull()

      // the note is not stored in sequenceToNoteHash or nonChainNoteHashes
      await expect(accountHasSequenceToNoteHash(accountA, 2, noteHash)).resolves.toBe(false)

      // but not nonChainNoteHashes
      await expect(accountHasNonChainNoteHash(accountA, noteHash)).resolves.toBe(false)
    })
  })

  describe('getBalance', () => {
    it('should not subtract unconfirmed spends from confirmed balance', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.updateHead()

      await expect(accountA.getBalance(Asset.nativeId(), 0)).resolves.toMatchObject({
        confirmed: 2000000000n,
        unconfirmed: 2000000000n,
      })

      const { block: block3 } = await useBlockWithTx(node, accountA, accountB, false)
      await node.chain.addBlock(block3)
      await node.wallet.updateHead()

      // with 0 confirmations, confirmed balance includes the transaction
      await expect(accountA.getBalance(Asset.nativeId(), 0)).resolves.toMatchObject({
        confirmed: 1999999998n,
        unconfirmed: 1999999998n,
      })

      // with 1 confirmation, confirmed balance should not include the transaction
      await expect(accountA.getBalance(Asset.nativeId(), 1)).resolves.toMatchObject({
        confirmed: 2000000000n,
        unconfirmed: 1999999998n,
      })
    })

    it('should not subtract unconfirmed spends from confirmed balance for transactions without change', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.updateHead()

      await expect(accountA.getBalance(Asset.nativeId(), 0)).resolves.toMatchObject({
        confirmed: 2000000000n,
        unconfirmed: 2000000000n,
      })

      // send 1 ORE from A to B with a fee of 1 ORE
      const { block: block3 } = await useBlockWithTx(node, accountA, accountB, false)
      await node.chain.addBlock(block3)
      await node.wallet.updateHead()

      // with 0 confirmations, confirmed balance includes the transaction
      await expect(accountB.getBalance(Asset.nativeId(), 0)).resolves.toMatchObject({
        confirmed: 1n,
        unconfirmed: 1n,
      })

      // send 1 ORE from B to A with no fee so that B receives no change
      const { block: block4 } = await useBlockWithTx(node, accountB, accountA, false, {
        fee: 0,
      })
      await node.chain.addBlock(block4)
      await node.wallet.updateHead()

      // with 0 confirmations, confirmed balance includes the transaction
      await expect(accountB.getBalance(Asset.nativeId(), 0)).resolves.toMatchObject({
        confirmed: 0n,
        unconfirmed: 0n,
      })

      // with 1 confirmation, confirmed balance does not include the transaction
      await expect(accountB.getBalance(Asset.nativeId(), 1)).resolves.toMatchObject({
        confirmed: 1n,
        unconfirmed: 0n,
      })
    })

    it('should calculate confirmed balance for custom assets', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.updateHead()

      await expect(accountA.getBalance(Asset.nativeId(), 0)).resolves.toMatchObject({
        confirmed: 2000000000n,
        unconfirmed: 2000000000n,
      })

      const asset = new Asset(accountA.spendingKey, 'mint-asset', 'metadata')

      const block3 = await useMintBlockFixture({
        node,
        account: accountA,
        asset,
        value: 10n,
      })
      await node.chain.addBlock(block3)
      await node.wallet.updateHead()

      // with 0 confirmations, confirmed balance includes the transaction
      await expect(accountA.getBalance(asset.id(), 0)).resolves.toMatchObject({
        confirmed: 10n,
        unconfirmed: 10n,
      })

      // with 1 confirmation, confirmed balance should not include the transaction
      await expect(accountA.getBalance(asset.id(), 1)).resolves.toMatchObject({
        confirmed: 0n,
        unconfirmed: 10n,
      })
    })
  })

  describe('calculatePendingBalance', () => {
    it('should calculate pending balance from unconfirmed balance and pending transactions', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.updateHead()

      const balanceA = await accountA.getBalance(Asset.nativeId(), 0)

      expect(balanceA).toMatchObject({
        confirmed: 2000000000n,
        unconfirmed: 2000000000n,
      })

      const headA = await accountA.getHead()

      Assert.isNotNull(headA)

      expect(headA).toMatchObject({
        hash: block2.header.hash,
        sequence: block2.header.sequence,
      })

      await useTxFixture(node.wallet, accountA, accountB)

      await expect(
        accountA['calculatePendingBalance'](
          headA?.sequence,
          Asset.nativeId(),
          balanceA.unconfirmed,
        ),
      ).resolves.toMatchObject({
        pending: balanceA.unconfirmed - 1n,
        pendingCount: 1,
      })
    })
  })
})
