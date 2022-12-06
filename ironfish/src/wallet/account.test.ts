/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import {
  createNodeTest,
  useAccountFixture,
  useMinerBlockFixture,
  useTxFixture,
} from '../testUtilities'
import { AsyncUtils } from '../utils/async'

describe('Accounts', () => {
  const nodeTest = createNodeTest()

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
    expect(noteHashesNotOnChain).toContainEqual(note1Encrypted.merkleHash())
    expect(noteHashesNotOnChain).toContainEqual(note2Encrypted.merkleHash())
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
        hash: note1Encrypted.merkleHash(),
      }),
    )

    expect(notesInSequence3).toHaveLength(1)
    expect(notesInSequence3).toContainEqual(
      expect.objectContaining({
        hash: note2Encrypted.merkleHash(),
      }),
    )

    // Check the notes are returned and in order
    expect(notesInSequence).toHaveLength(2)
    expect(notesInSequence[0].hash).toEqual(note1Encrypted.merkleHash())
    expect(notesInSequence[1].hash).toEqual(note2Encrypted.merkleHash())

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

    await expect(account.getBalance(1, 1)).resolves.toMatchObject({
      confirmed: BigInt(0),
      pending: BigInt(2000000000),
    })

    await account.expireTransaction(tx)

    await expect(AsyncUtils.materialize(account.getNotes())).resolves.toHaveLength(0)

    await expect(
      AsyncUtils.materialize(node.wallet.walletDb.loadNoteHashesNotOnChain(account)),
    ).resolves.toHaveLength(0)

    await expect(account.getBalance(1, 1)).resolves.toMatchObject({
      confirmed: BigInt(0),
      pending: BigInt(0),
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
      for (const note of transaction.notes()) {
        const decryptedNote = await accountA.getDecryptedNote(note.merkleHash())

        expect(decryptedNote).toBeDefined()

        const nonChainIndex = await accountA['walletDb'].nonChainNoteHashes.get([
          accountA.prefix,
          note.merkleHash(),
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

      for (const spend of transaction.spends()) {
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
        [transaction.expirationSequence(), transaction.hash()],
      ])

      expect(pendingHashEntry).toBeDefined()
    })
  })
})
