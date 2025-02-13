/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { BufferMap } from 'buffer-map'
import { Assert } from '../../assert'
import { DEVNET } from '../../networks'
import {
  createNodeTest,
  useAccountFixture,
  useBlockWithTx,
  useBlockWithTxs,
  useBurnBlockFixture,
  useMinerBlockFixture,
  useMintBlockFixture,
  usePostTxFixture,
  useTxFixture,
} from '../../testUtilities'
import { AsyncUtils } from '../../utils/async'
import { MasterKey } from '../masterKey'
import { BalanceValue } from '../walletdb/balanceValue'
import { Account } from './account'
import { EncryptedAccount } from './encryptedAccount'

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

    await node.wallet.scan()

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

  describe('setName', () => {
    it('should rename an account', async () => {
      const { node } = nodeTest

      const account = await useAccountFixture(node.wallet, 'accountA')

      await account.setName('newName')

      expect(node.wallet.getAccountByName('newName')).toBeDefined()
    })

    it('should not allow blank names', async () => {
      const { node } = nodeTest

      const account = await useAccountFixture(node.wallet, 'accountA')

      await expect(account.setName('')).rejects.toThrow('Account name cannot be blank')
      await expect(account.setName('     ')).rejects.toThrow('Account name cannot be blank')
    })

    it('should throw an error if the passphrase is missing and the wallet is encrypted', async () => {
      const { node } = nodeTest
      const passphrase = 'foo'

      const account = await useAccountFixture(node.wallet, 'accountA')
      await node.wallet.encrypt(passphrase)

      await expect(account.setName('B')).rejects.toThrow()
    })

    it('should throw an error if there is no master key and the wallet is encrypted', async () => {
      const { node } = nodeTest
      const passphrase = 'foo'

      const account = await useAccountFixture(node.wallet, 'accountA')
      await node.wallet.encrypt(passphrase)

      await expect(account.setName('B')).rejects.toThrow()
    })

    it('should save the encrypted account if the passphrase is correct and the wallet is encrypted', async () => {
      const { node } = nodeTest
      const passphrase = 'foo'
      const newName = 'B'

      const account = await useAccountFixture(node.wallet, 'accountA')
      await node.wallet.encrypt(passphrase)

      await node.wallet.unlock(passphrase)
      await node.wallet.setName(account, newName)
      await node.wallet.lock()

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

      expect(decryptedAccount.name).toEqual(newName)
    })
  })

  describe('loadPendingTransactions', () => {
    it('should load pending transactions', async () => {
      const { node } = nodeTest

      const account = await useAccountFixture(node.wallet, 'accountA')

      const block1 = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
      await node.chain.addBlock(block1)
      await node.wallet.scan()

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
      await node.wallet.scan()

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
      await node.wallet.scan()

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
      await node.wallet.scan()

      // create expired transaction
      await useTxFixture(node.wallet, account, account, undefined, undefined, 3)

      const block2 = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

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
      const asset = new Asset(account.publicAddress, 'mint-asset', 'metadata')
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
      await node.wallet.scan()

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
      await node.wallet.scan()

      const transaction = await useTxFixture(node.wallet, accountA, accountA)

      expect(addPendingSpy).toHaveBeenCalled()

      for (const spend of transaction.spends) {
        const spentNoteHash = await accountA.getNoteHash(spend.nullifier)

        Assert.isNotUndefined(spentNoteHash)

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
      await node.wallet.scan()

      const transaction = await useTxFixture(node.wallet, accountA, accountA)

      expect(addPendingSpy).toHaveBeenCalled()

      const pendingHashEntry = await accountA['walletDb'].pendingTransactionHashes.get([
        accountA.prefix,
        [transaction.expiration(), transaction.hash()],
      ])

      expect(pendingHashEntry).toBeDefined()
    })

    it('should save the transaction hash for a nullifier if it does not already exist', async () => {
      const { node } = nodeTest

      const account = await useAccountFixture(node.wallet)
      const block = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
      await node.chain.addBlock(block)
      await node.wallet.scan()

      // Add a pending transaction and check the nullifier
      const transaction = await useTxFixture(node.wallet, account, account)
      const nullifier = transaction.getSpend(0).nullifier
      const transactionHash = await account['walletDb'].getTransactionHashFromNullifier(
        account,
        nullifier,
      )
      expect(transactionHash).toEqual(transaction.hash())
    })

    it('should not overwrite the transaction hash for a nullifier if it already exists', async () => {
      const { node: nodeA } = await nodeTest.createSetup()
      const { node: nodeB } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(nodeA.wallet, 'accountA')
      const accountB = await nodeB.wallet.importAccount(accountA)

      // Ensure both nodes for the same account have the same note
      const block = await useMinerBlockFixture(nodeA.chain, undefined, accountA, nodeA.wallet)
      await nodeA.chain.addBlock(block)
      await nodeA.wallet.scan()
      await nodeB.chain.addBlock(block)
      await nodeB.wallet.scan()

      // Spend the same note in both nodes
      const transactionA = await useTxFixture(nodeA.wallet, accountA, accountA)
      const transactionB = await useTxFixture(nodeB.wallet, accountB, accountB)

      // Add the pending transaction from Node B but ensure we have the original hash
      await nodeA.wallet.addPendingTransaction(transactionB)
      const nullifier = transactionB.getSpend(0).nullifier
      const transactionHash = await accountA['walletDb'].getTransactionHashFromNullifier(
        accountA,
        nullifier,
      )
      expect(transactionHash).toEqual(transactionA.hash())
    })

    it('should remove spent notes from unspentNoteHashes', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      let unspentA = await AsyncUtils.materialize(
        accountA['walletDb'].loadUnspentNoteHashes(accountA, Asset.nativeId()),
      )

      expect(unspentA).toHaveLength(1)

      // create a pending transaction
      await useTxFixture(node.wallet, accountA, accountB)

      unspentA = await AsyncUtils.materialize(
        accountA['walletDb'].loadUnspentNoteHashes(accountA, Asset.nativeId()),
      )
      expect(unspentA).toHaveLength(0)
    })

    it('should not add output notes to unspentNoteHashes', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      // create a pending transaction
      await useTxFixture(node.wallet, accountA, accountB)

      const unspentB = await AsyncUtils.materialize(
        accountB['walletDb'].loadUnspentNoteHashes(accountB, Asset.nativeId()),
      )
      expect(unspentB).toHaveLength(0)
    })

    it('should only save transactions to accounts involved in the transaction', async () => {
      const { node } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'a')
      await useAccountFixture(node.wallet, 'b')

      const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await expect(node.chain).toAddBlock(blockA1)
      await node.wallet.scan()

      const saveSpy = jest.spyOn(accountA['walletDb'], 'saveTransaction')

      await useTxFixture(node.wallet, accountA, accountA)

      // tx added to accountA, but not accountB
      expect(saveSpy).toHaveBeenCalledTimes(1)
      expect(saveSpy.mock.lastCall?.[0]).toEqual(accountA)
    })
  })

  describe('connectTransaction', () => {
    it('should create decrypted notes marked as on chain', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const connectSpy = jest.spyOn(accountA, 'connectTransaction')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      const transaction = await useTxFixture(node.wallet, accountA, accountA)
      const block3 = await useMinerBlockFixture(node.chain, 3, accountA, undefined, [
        transaction,
      ])
      await node.chain.addBlock(block3)
      await node.wallet.scan()

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
      await node.wallet.scan()

      const transaction = await useTxFixture(node.wallet, accountA, accountA)
      const block3 = await useMinerBlockFixture(node.chain, 3, accountA, undefined, [
        transaction,
      ])
      await node.chain.addBlock(block3)
      await node.wallet.scan()

      expect(connectSpy).toHaveBeenCalled()

      for (const spend of transaction.spends) {
        const spentNoteHash = await accountA.getNoteHash(spend.nullifier)

        Assert.isNotUndefined(spentNoteHash)

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
      await node.wallet.scan()

      const transaction = await useTxFixture(node.wallet, accountA, accountA)
      const block3 = await useMinerBlockFixture(node.chain, 3, accountA, undefined, [
        transaction,
      ])
      await node.chain.addBlock(block3)
      await node.wallet.scan()

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
      await node.wallet.scan()

      const transaction = await useTxFixture(node.wallet, accountA, accountA)
      const block3 = await useMinerBlockFixture(node.chain, 3, accountA, undefined, [
        transaction,
      ])
      await node.chain.addBlock(block3)
      await node.wallet.scan()

      expect(connectSpy).toHaveBeenCalled()

      const sequenceIndexEntry = await node.wallet.walletDb.sequenceToTransactionHash.get([
        accountA.prefix,
        [block3.header.sequence, transaction.hash()],
      ])

      expect(sequenceIndexEntry).toBeNull()
    })

    it('should set new transaction timestamps equal to the block header timestamp', async () => {
      const { node } = await nodeTest.createSetup()
      const { node: freshNode } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      const { block: block3, transactions } = await useBlockWithTxs(node, 1, accountA)
      await node.chain.addBlock(block3)
      expect(transactions.length).toBe(1)

      // Create a fresh node and import the account so that the transactions
      // are synced to the wallet through the block and not through transaction creation
      const freshAccountA = await freshNode.wallet.importAccount(accountA)
      for await (const header of node.chain.iterateTo(node.chain.genesis)) {
        if (header.sequence === 1) {
          continue
        }
        const block = await node.chain.getBlock(header)
        Assert.isNotNull(block)
        await expect(freshNode.chain).toAddBlock(block)
      }

      await freshNode.wallet.scan()

      const transactionRecord = await freshAccountA.getTransaction(transactions[0].hash())

      Assert.isNotUndefined(transactionRecord)

      expect(transactionRecord.timestamp).toEqual(block3.header.timestamp)
    })

    it('should set preserve pending transaction timestamps', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      const transaction = await useTxFixture(node.wallet, accountA, accountA)

      const pendingRecord = await accountA.getTransaction(transaction.hash())
      Assert.isNotUndefined(pendingRecord)

      expect(pendingRecord.sequence).toBeNull()

      const block3 = await useMinerBlockFixture(node.chain, 3, accountA, undefined, [
        transaction,
      ])
      await node.chain.addBlock(block3)
      await node.wallet.scan()

      const connectedRecord = await accountA.getTransaction(transaction.hash())
      Assert.isNotUndefined(connectedRecord)

      expect(connectedRecord.sequence).toEqual(block3.header.sequence)
      expect(connectedRecord.timestamp).toEqual(pendingRecord.timestamp)
    })

    it('should correctly update the asset store from a mint description', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      const asset = new Asset(accountA.publicAddress, 'mint-asset', 'metadata')
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

      expect(await accountA['walletDb'].getAsset(accountA, asset.id())).toEqual({
        blockHash: mintBlock.header.hash,
        createdTransactionHash: mintBlock.transactions[1].hash(),
        id: asset.id(),
        metadata: asset.metadata(),
        name: asset.name(),
        nonce: asset.nonce(),
        creator: asset.creator(),
        owner: asset.creator(),
        sequence: mintBlock.header.sequence,
        supply: value,
      })

      expect(await accountB['walletDb'].getAsset(accountB, asset.id())).toBeUndefined()
    })

    it('should overwrite pending asset fields from a connected mint description', async () => {
      const { node } = nodeTest
      const account = await useAccountFixture(node.wallet)
      const asset = new Asset(account.publicAddress, 'testcoin', 'metadata')

      const minerBlock = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
      await node.chain.addBlock(minerBlock)
      await node.wallet.scan()

      const firstMintValue = BigInt(10)
      const firstMintBlock = await useMintBlockFixture({
        node,
        account,
        asset,
        value: firstMintValue,
        sequence: 3,
      })
      const firstMintTransaction = firstMintBlock.transactions[1]

      // Verify block fields are empty since this has not been connected yet
      expect(await account['walletDb'].getAsset(account, asset.id())).toEqual({
        blockHash: null,
        createdTransactionHash: firstMintTransaction.hash(),
        id: asset.id(),
        metadata: asset.metadata(),
        name: asset.name(),
        nonce: asset.nonce(),
        creator: asset.creator(),
        owner: asset.creator(),
        sequence: null,
        supply: BigInt(0),
      })

      const secondMintValue = BigInt(42)
      const secondMintBlock = await useMintBlockFixture({
        node,
        account,
        asset,
        value: secondMintValue,
        sequence: 3,
      })
      const secondMintTransaction = secondMintBlock.transactions[1]
      await expect(node.chain).toAddBlock(secondMintBlock)
      await node.wallet.scan()

      // Verify block fields are for the second block since that was connected
      expect(await account['walletDb'].getAsset(account, asset.id())).toEqual({
        blockHash: secondMintBlock.header.hash,
        createdTransactionHash: secondMintTransaction.hash(),
        id: asset.id(),
        metadata: asset.metadata(),
        name: asset.name(),
        nonce: asset.nonce(),
        creator: asset.creator(),
        owner: asset.creator(),
        sequence: secondMintBlock.header.sequence,
        supply: secondMintValue,
      })
    })

    it('should correctly update the asset store from a mint description with ownership transfer', async () => {
      const assetOwnershipNetworkDefinition = {
        ...DEVNET,
        consensus: {
          ...DEVNET.consensus,
          enableAssetOwnership: 1,
        },
        id: 999,
      }
      const { node } = await nodeTest.createSetup({
        networkDefinition: assetOwnershipNetworkDefinition,
      })

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const asset = new Asset(accountA.publicAddress, 'mint-asset', 'metadata')
      const value = BigInt(10)
      const mintBlock = await useMintBlockFixture({
        node,
        account: accountA,
        asset,
        value,
        transferOwnershipTo: accountB.publicAddress,
      })
      await expect(node.chain).toAddBlock(mintBlock)
      await node.wallet.scan()

      expect(await accountA['walletDb'].getAsset(accountA, asset.id())).toEqual({
        blockHash: mintBlock.header.hash,
        createdTransactionHash: mintBlock.transactions[1].hash(),
        id: asset.id(),
        metadata: asset.metadata(),
        name: asset.name(),
        nonce: asset.nonce(),
        creator: Buffer.from(accountA.publicAddress, 'hex'),
        owner: Buffer.from(accountB.publicAddress, 'hex'),
        sequence: mintBlock.header.sequence,
        supply: null,
      })

      expect(await accountA['walletDb'].getAsset(accountB, asset.id())).toEqual({
        blockHash: mintBlock.header.hash,
        createdTransactionHash: mintBlock.transactions[1].hash(),
        id: asset.id(),
        metadata: asset.metadata(),
        name: asset.name(),
        nonce: asset.nonce(),
        creator: Buffer.from(accountA.publicAddress, 'hex'),
        owner: Buffer.from(accountB.publicAddress, 'hex'),
        sequence: mintBlock.header.sequence,
        supply: value,
      })
    })

    it('should correctly update the asset store from a burn description', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      const asset = new Asset(accountA.publicAddress, 'mint-asset', 'metadata')
      const mintValue = BigInt(10)
      const mintBlock = await useMintBlockFixture({
        node,
        account: accountA,
        asset,
        value: mintValue,
        sequence: 3,
      })
      await expect(node.chain).toAddBlock(mintBlock)
      await node.wallet.scan()

      const burnValue = BigInt(1)
      const burnBlock = await useBurnBlockFixture({
        node,
        account: accountA,
        asset,
        value: burnValue,
        sequence: 4,
      })
      await expect(node.chain).toAddBlock(burnBlock)
      await node.wallet.scan()

      expect(await accountA['walletDb'].getAsset(accountA, asset.id())).toEqual({
        blockHash: mintBlock.header.hash,
        createdTransactionHash: mintBlock.transactions[1].hash(),
        id: asset.id(),
        metadata: asset.metadata(),
        name: asset.name(),
        nonce: asset.nonce(),
        creator: asset.creator(),
        owner: asset.creator(),
        sequence: mintBlock.header.sequence,
        supply: mintValue - burnValue,
      })
      expect(await accountB['walletDb'].getAsset(accountB, asset.id())).toBeUndefined()

      // Send some of Account A coins to Account B
      const transfer = await usePostTxFixture({
        node,
        wallet: node.wallet,
        from: accountA,
        to: accountB,
        assetId: asset.id(),
        amount: BigInt(1n),
      })
      const block = await useMinerBlockFixture(node.chain, undefined, undefined, undefined, [
        transfer,
      ])
      await expect(node.chain).toAddBlock(block)
      await node.wallet.scan()

      // Account B should be able to burn the received asset
      const burnBlockFromAccountB = await useBurnBlockFixture({
        node,
        account: accountB,
        asset,
        value: BigInt(1),
      })
      await expect(node.chain).toAddBlock(burnBlockFromAccountB)
      await node.wallet.scan()

      expect(await accountB['walletDb'].getAsset(accountB, asset.id())).toEqual({
        blockHash: block.header.hash,
        createdTransactionHash: mintBlock.transactions[1].hash(),
        id: asset.id(),
        metadata: asset.metadata(),
        name: asset.name(),
        nonce: asset.nonce(),
        creator: asset.creator(),
        owner: asset.creator(),
        sequence: block.header.sequence,
        supply: null,
      })
    })

    it('should overwrite the transaction hash for a nullifier if connected on a block', async () => {
      const { node: nodeA } = await nodeTest.createSetup()
      const { node: nodeB } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(nodeA.wallet, 'accountA')
      const accountB = await nodeB.wallet.importAccount(accountA)

      // Ensure both nodes for the same account have the same note
      const block1 = await useMinerBlockFixture(nodeA.chain, undefined, accountA, nodeA.wallet)
      await nodeA.chain.addBlock(block1)
      await nodeA.wallet.scan()
      await nodeB.chain.addBlock(block1)
      await nodeB.wallet.scan()

      // Spend the same note in both nodes
      const transactionA = await useTxFixture(nodeA.wallet, accountA, accountA)
      const transactionB = await useTxFixture(nodeB.wallet, accountB, accountB)

      // Verify the existing record has the Transaction A Hash
      const nullifier = transactionA.getSpend(0).nullifier
      let transactionHash = await accountA['walletDb'].getTransactionHashFromNullifier(
        accountA,
        nullifier,
      )
      expect(transactionHash).toEqual(transactionA.hash())

      const block2 = await useMinerBlockFixture(
        nodeB.chain,
        undefined,
        accountB,
        nodeB.wallet,
        [transactionB],
      )
      await nodeA.chain.addBlock(block2)
      await nodeA.wallet.scan()

      // Verify the transaction hash for the nullifier has been overwritten
      transactionHash = await accountA['walletDb'].getTransactionHashFromNullifier(
        accountA,
        nullifier,
      )
      expect(transactionHash).toEqual(transactionB.hash())
    })

    it('should add received notes to unspentNoteHashes', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      const unspentNoteHashes = await AsyncUtils.materialize(
        accountA['walletDb'].loadUnspentNoteHashes(accountA, Asset.nativeId()),
      )

      expect(unspentNoteHashes).toHaveLength(1)

      const decryptedNote = await accountA.getDecryptedNote(unspentNoteHashes[0])

      expect(decryptedNote).toBeDefined()
    })

    it('should remove spent notes from unspentNoteHashes', async () => {
      const { node: nodeA } = nodeTest
      const { node: nodeB } = await nodeTest.createSetup()

      const accountAnodeA = await useAccountFixture(nodeA.wallet, 'accountA')

      // import account onto nodeB to simulate connecting transaction not seen as pending
      const accountAnodeB = await nodeB.wallet.importAccount(accountAnodeA)

      const block2 = await useMinerBlockFixture(
        nodeA.chain,
        undefined,
        accountAnodeA,
        nodeA.wallet,
      )
      await nodeA.chain.addBlock(block2)
      await nodeA.wallet.scan()
      await nodeB.chain.addBlock(block2)
      await nodeB.wallet.scan()

      const unspentNoteHashesBefore = await AsyncUtils.materialize(
        accountAnodeB['walletDb'].loadUnspentNoteHashes(accountAnodeB, Asset.nativeId()),
      )
      expect(unspentNoteHashesBefore).toHaveLength(1)

      const transaction = await useTxFixture(nodeA.wallet, accountAnodeA, accountAnodeA)

      // transaction is pending, but nodeB hasn't seen it, so note is still unspent
      const unspentNoteHashesPending = await AsyncUtils.materialize(
        accountAnodeB['walletDb'].loadUnspentNoteHashes(accountAnodeB, Asset.nativeId()),
      )
      expect(unspentNoteHashesPending).toEqual(unspentNoteHashesBefore)

      // mine the transaction on a block that nodeB adds
      const block3 = await useMinerBlockFixture(nodeA.chain, 3, accountAnodeA, undefined, [
        transaction,
      ])
      await nodeA.chain.addBlock(block3)
      await nodeA.wallet.scan()
      await nodeB.chain.addBlock(block3)
      await nodeB.wallet.scan()

      const unspentNoteHashesAfter = await AsyncUtils.materialize(
        accountAnodeB['walletDb'].loadUnspentNoteHashes(accountAnodeB, Asset.nativeId()),
      )
      expect(unspentNoteHashesAfter).not.toEqual(unspentNoteHashesBefore)
    })
  })

  describe('disconnectTransaction', () => {
    it('should revert decrypted notes to be marked as off chain', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      const transaction = await useTxFixture(node.wallet, accountA, accountA)
      const block3 = await useMinerBlockFixture(node.chain, 3, accountA, undefined, [
        transaction,
      ])
      await node.chain.addBlock(block3)
      await node.wallet.scan()

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
      await node.wallet.scan()

      const transaction = await useTxFixture(node.wallet, accountA, accountA)
      const block3 = await useMinerBlockFixture(node.chain, 3, accountA, undefined, [
        transaction,
      ])
      await node.chain.addBlock(block3)
      await node.wallet.scan()

      for (const spend of transaction.spends) {
        const spentNoteHash = await accountA.getNoteHash(spend.nullifier)

        Assert.isNotUndefined(spentNoteHash)

        const spentNote = await accountA.getDecryptedNote(spentNoteHash)

        Assert.isNotUndefined(spentNote)

        expect(spentNote.spent).toBeTruthy()
      }

      // disconnect transaction
      await accountA.disconnectTransaction(block3.header, transaction)

      for (const spend of transaction.spends) {
        const spentNoteHash = await accountA.getNoteHash(spend.nullifier)

        Assert.isNotUndefined(spentNoteHash)

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
      await node.wallet.scan()

      const transaction = await useTxFixture(node.wallet, accountA, accountA)
      const block3 = await useMinerBlockFixture(node.chain, 3, accountA, undefined, [
        transaction,
      ])
      await node.chain.addBlock(block3)
      await node.wallet.scan()

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
      await node.wallet.scan()

      const transaction = await useTxFixture(node.wallet, accountA, accountA)
      const block3 = await useMinerBlockFixture(node.chain, 3, accountA, undefined, [
        transaction,
      ])
      await node.chain.addBlock(block3)
      await node.wallet.scan()

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

    it('should correctly update the asset store from a mint description', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      const asset = new Asset(accountA.publicAddress, 'mint-asset', 'metadata')
      const firstMintValue = BigInt(10)
      const firstMintBlock = await useMintBlockFixture({
        node,
        account: accountA,
        asset,
        value: firstMintValue,
        sequence: 3,
      })
      await expect(node.chain).toAddBlock(firstMintBlock)
      await node.wallet.scan()

      const secondMintValue = BigInt(10)
      const secondMintBlock = await useMintBlockFixture({
        node,
        account: accountA,
        asset,
        value: secondMintValue,
        sequence: 4,
      })
      await expect(node.chain).toAddBlock(secondMintBlock)
      await node.wallet.scan()

      // Check the aggregate from both mints
      expect(await accountA['walletDb'].getAsset(accountA, asset.id())).toEqual({
        blockHash: firstMintBlock.header.hash,
        createdTransactionHash: firstMintBlock.transactions[1].hash(),
        id: asset.id(),
        metadata: asset.metadata(),
        name: asset.name(),
        nonce: asset.nonce(),
        creator: asset.creator(),
        owner: asset.creator(),
        sequence: firstMintBlock.header.sequence,
        supply: firstMintValue + secondMintValue,
      })

      await accountA.disconnectTransaction(
        secondMintBlock.header,
        secondMintBlock.transactions[1],
      )
      expect(await accountA['walletDb'].getAsset(accountA, asset.id())).toEqual({
        blockHash: firstMintBlock.header.hash,
        createdTransactionHash: firstMintBlock.transactions[1].hash(),
        id: asset.id(),
        metadata: asset.metadata(),
        name: asset.name(),
        nonce: asset.nonce(),
        creator: asset.creator(),
        owner: asset.creator(),
        sequence: firstMintBlock.header.sequence,
        supply: firstMintValue,
      })
      expect(await accountB['walletDb'].getAsset(accountB, asset.id())).toBeUndefined()

      await accountA.disconnectTransaction(
        firstMintBlock.header,
        firstMintBlock.transactions[1],
      )
      // Verify the block fields are null after a disconnect
      expect(await accountA['walletDb'].getAsset(accountA, asset.id())).toEqual({
        blockHash: null,
        createdTransactionHash: firstMintBlock.transactions[1].hash(),
        id: asset.id(),
        metadata: asset.metadata(),
        name: asset.name(),
        nonce: asset.nonce(),
        creator: asset.creator(),
        owner: asset.creator(),
        sequence: null,
        supply: BigInt(0),
      })

      // Expiration of the first mint will delete the record
      await accountA.expireTransaction(firstMintBlock.transactions[1])
      expect(await accountA['walletDb'].getAsset(accountA, asset.id())).toBeUndefined()
      expect(await accountB['walletDb'].getAsset(accountB, asset.id())).toBeUndefined()
    })

    it('should correctly update the asset store from a mint description with ownership transfer', async () => {
      const assetOwnershipNetworkDefinition = {
        ...DEVNET,
        consensus: {
          ...DEVNET.consensus,
          enableAssetOwnership: 1,
        },
        id: 999,
      }
      const { node } = await nodeTest.createSetup({
        networkDefinition: assetOwnershipNetworkDefinition,
      })

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      const asset = new Asset(accountA.publicAddress, 'mint-asset', 'metadata')
      const firstMintValue = BigInt(10)
      const firstMintBlock = await useMintBlockFixture({
        node,
        account: accountA,
        asset,
        value: firstMintValue,
        transferOwnershipTo: accountB.publicAddress,
        sequence: 3,
      })
      await expect(node.chain).toAddBlock(firstMintBlock)
      await node.wallet.scan()

      const secondMintValue = BigInt(5)
      const secondMintBlock = await useMintBlockFixture({
        node,
        account: accountB,
        asset,
        value: secondMintValue,
        sequence: 4,
      })
      await expect(node.chain).toAddBlock(secondMintBlock)
      await node.wallet.scan()

      // Check the aggregate from both mints
      expect(await accountA['walletDb'].getAsset(accountA, asset.id())).toEqual({
        blockHash: firstMintBlock.header.hash,
        createdTransactionHash: firstMintBlock.transactions[1].hash(),
        id: asset.id(),
        metadata: asset.metadata(),
        name: asset.name(),
        nonce: asset.nonce(),
        creator: Buffer.from(accountA.publicAddress, 'hex'),
        owner: Buffer.from(accountB.publicAddress, 'hex'),
        sequence: firstMintBlock.header.sequence,
        supply: null,
      })

      expect(await accountB['walletDb'].getAsset(accountB, asset.id())).toEqual({
        blockHash: firstMintBlock.header.hash,
        createdTransactionHash: firstMintBlock.transactions[1].hash(),
        id: asset.id(),
        metadata: asset.metadata(),
        name: asset.name(),
        nonce: asset.nonce(),
        creator: Buffer.from(accountA.publicAddress, 'hex'),
        owner: Buffer.from(accountB.publicAddress, 'hex'),
        sequence: firstMintBlock.header.sequence,
        supply: firstMintValue + secondMintValue,
      })

      await accountA.disconnectTransaction(
        secondMintBlock.header,
        secondMintBlock.transactions[1],
      )
      expect(await accountA['walletDb'].getAsset(accountA, asset.id())).toEqual({
        blockHash: firstMintBlock.header.hash,
        createdTransactionHash: firstMintBlock.transactions[1].hash(),
        id: asset.id(),
        metadata: asset.metadata(),
        name: asset.name(),
        nonce: asset.nonce(),
        creator: Buffer.from(accountA.publicAddress, 'hex'),
        owner: Buffer.from(accountB.publicAddress, 'hex'),
        sequence: firstMintBlock.header.sequence,
        supply: null,
      })

      await accountB.disconnectTransaction(
        secondMintBlock.header,
        secondMintBlock.transactions[1],
      )
      expect(await accountB['walletDb'].getAsset(accountB, asset.id())).toEqual({
        blockHash: firstMintBlock.header.hash,
        createdTransactionHash: firstMintBlock.transactions[1].hash(),
        id: asset.id(),
        metadata: asset.metadata(),
        name: asset.name(),
        nonce: asset.nonce(),
        creator: Buffer.from(accountA.publicAddress, 'hex'),
        owner: Buffer.from(accountB.publicAddress, 'hex'),
        sequence: firstMintBlock.header.sequence,
        supply: firstMintValue,
      })

      // Verify that the owner went back to the creator after disconnecting the
      // first mint
      await accountA.disconnectTransaction(
        firstMintBlock.header,
        firstMintBlock.transactions[1],
      )
      expect(await accountA['walletDb'].getAsset(accountA, asset.id())).toEqual({
        blockHash: null,
        createdTransactionHash: firstMintBlock.transactions[1].hash(),
        id: asset.id(),
        metadata: asset.metadata(),
        name: asset.name(),
        nonce: asset.nonce(),
        creator: Buffer.from(accountA.publicAddress, 'hex'),
        owner: Buffer.from(accountA.publicAddress, 'hex'),
        sequence: null,
        supply: null,
      })

      await accountB.disconnectTransaction(
        firstMintBlock.header,
        firstMintBlock.transactions[1],
      )
      expect(await accountA['walletDb'].getAsset(accountB, asset.id())).toEqual({
        blockHash: null,
        createdTransactionHash: firstMintBlock.transactions[1].hash(),
        id: asset.id(),
        metadata: asset.metadata(),
        name: asset.name(),
        nonce: asset.nonce(),
        creator: Buffer.from(accountA.publicAddress, 'hex'),
        owner: Buffer.from(accountA.publicAddress, 'hex'),
        sequence: null,
        supply: null,
      })

      // Expiration of the first mint will delete the record
      await accountA.expireTransaction(firstMintBlock.transactions[1])
      expect(await accountA['walletDb'].getAsset(accountA, asset.id())).toBeUndefined()
      await accountB.expireTransaction(firstMintBlock.transactions[1])
      expect(await accountB['walletDb'].getAsset(accountB, asset.id())).toBeUndefined()
    })

    it('should correctly update the asset store from a burn description', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      const asset = new Asset(accountA.publicAddress, 'mint-asset', 'metadata')
      const mintValue = BigInt(10)
      const mintBlock = await useMintBlockFixture({
        node,
        account: accountA,
        asset,
        value: mintValue,
      })
      await expect(node.chain).toAddBlock(mintBlock)
      await node.wallet.scan()

      // Send some of Account A coins to Account B
      const transfer = await usePostTxFixture({
        node,
        wallet: node.wallet,
        from: accountA,
        to: accountB,
        assetId: asset.id(),
        amount: BigInt(1n),
      })
      const block = await useMinerBlockFixture(node.chain, undefined, undefined, undefined, [
        transfer,
      ])
      await expect(node.chain).toAddBlock(block)
      await node.wallet.scan()

      const burnValue = BigInt(1)
      const burnBlock = await useBurnBlockFixture({
        node,
        account: accountA,
        asset,
        value: burnValue,
      })
      await expect(node.chain).toAddBlock(burnBlock)
      await node.wallet.scan()

      expect(await accountA['walletDb'].getAsset(accountA, asset.id())).toMatchObject({
        createdTransactionHash: mintBlock.transactions[1].hash(),
        id: asset.id(),
        metadata: asset.metadata(),
        name: asset.name(),
        creator: asset.creator(),
        owner: asset.creator(),
        supply: mintValue - burnValue,
      })

      await accountA.disconnectTransaction(burnBlock.header, burnBlock.transactions[1])
      expect(await accountA['walletDb'].getAsset(accountA, asset.id())).toMatchObject({
        createdTransactionHash: mintBlock.transactions[1].hash(),
        id: asset.id(),
        metadata: asset.metadata(),
        name: asset.name(),
        creator: asset.creator(),
        owner: asset.creator(),
        supply: mintValue,
      })

      // Account B should be able to burn the received asset
      const burnBlockFromAccountB = await useBurnBlockFixture({
        node,
        account: accountB,
        asset,
        value: BigInt(1),
      })
      await expect(node.chain).toAddBlock(burnBlockFromAccountB)
      await node.wallet.scan()
      // Verify Account B has the asset
      expect(await accountB['walletDb'].getAsset(accountB, asset.id())).not.toBeUndefined()

      // Disconnect the burn from Account B
      await accountB.disconnectTransaction(
        burnBlockFromAccountB.header,
        burnBlockFromAccountB.transactions[1],
      )
      expect(await accountB['walletDb'].getAsset(accountB, asset.id())).toEqual({
        blockHash: block.header.hash,
        createdTransactionHash: mintBlock.transactions[1].hash(),
        id: asset.id(),
        metadata: asset.metadata(),
        name: asset.name(),
        nonce: asset.nonce(),
        creator: asset.creator(),
        owner: asset.creator(),
        sequence: block.header.sequence,
        supply: null,
      })
    })

    it('should remove disconnected output notes from unspentNoteHashes', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      const transaction = await useTxFixture(node.wallet, accountA, accountB)
      const block3 = await useMinerBlockFixture(node.chain, 3, accountA, undefined, [
        transaction,
      ])
      await node.chain.addBlock(block3)
      await node.wallet.scan()

      let unspentNoteHashesB = await AsyncUtils.materialize(
        accountB['walletDb'].loadUnspentNoteHashes(accountB, Asset.nativeId()),
      )

      expect(unspentNoteHashesB).toHaveLength(1)

      // disconnect transaction
      await accountB.disconnectTransaction(block3.header, transaction)

      unspentNoteHashesB = await AsyncUtils.materialize(
        accountB['walletDb'].loadUnspentNoteHashes(accountB, Asset.nativeId()),
      )

      expect(unspentNoteHashesB).toHaveLength(0)
    })
  })

  describe('deleteTransaction', () => {
    it('should delete transaction record from the database', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

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
      await node.wallet.scan()

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
      await expect(accountA.getNoteHash(nullifier)).resolves.toBeUndefined()

      // the note is not stored in sequenceToNoteHash or nonChainNoteHashes
      await expect(accountHasSequenceToNoteHash(accountA, 2, noteHash)).resolves.toBe(false)

      // but not nonChainNoteHashes
      await expect(accountHasNonChainNoteHash(accountA, noteHash)).resolves.toBe(false)
    })

    it('should delete expired transactions that created assets', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      const asset = new Asset(accountA.publicAddress, 'mint-asset', 'metadata')

      const mintTx = await usePostTxFixture({
        node,
        wallet: node.wallet,
        from: accountA,
        mints: [
          {
            creator: asset.creator().toString('hex'),
            name: asset.name().toString('utf8'),
            metadata: asset.metadata().toString('utf8'),
            value: 10n,
          },
        ],
        expiration: 3,
      })

      // wallet should have the new asset
      let assets = await AsyncUtils.materialize(accountA.getAssets())
      expect(assets).toHaveLength(2)
      expect(assets[0].id).toEqualBuffer(Asset.nativeId())
      expect(assets[1].id).toEqualBuffer(asset.id())

      // expire the mint transaction
      await accountA.expireTransaction(mintTx)

      // wallet should have removed the new asset from the expired mint
      assets = await AsyncUtils.materialize(accountA.getAssets())
      expect(assets).toHaveLength(1)

      // expired mint should still be in the wallet
      const expiredMintTx = await accountA.getTransaction(mintTx.hash())
      Assert.isNotUndefined(expiredMintTx)

      // delete the transaction
      await accountA.deleteTransaction(expiredMintTx.transaction)

      // expired mint should not be in the wallet anymore
      await expect(accountA.getTransaction(mintTx.hash())).resolves.toBeUndefined()
    })
  })

  describe('getBalance', () => {
    it('should not subtract unconfirmed spends from confirmed balance', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      await expect(accountA.getBalance(Asset.nativeId(), 0)).resolves.toMatchObject({
        confirmed: 2000000000n,
        unconfirmed: 2000000000n,
      })

      const { block: block3 } = await useBlockWithTx(node, accountA, accountB, false)
      await node.chain.addBlock(block3)
      await node.wallet.scan()

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
      await node.wallet.scan()

      await expect(accountA.getBalance(Asset.nativeId(), 0)).resolves.toMatchObject({
        confirmed: 2000000000n,
        unconfirmed: 2000000000n,
      })

      // send 1 ORE from A to B with a fee of 1 ORE
      const { block: block3 } = await useBlockWithTx(node, accountA, accountB, false)
      await node.chain.addBlock(block3)
      await node.wallet.scan()

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
      await node.wallet.scan()

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
      await node.wallet.scan()

      await expect(accountA.getBalance(Asset.nativeId(), 0)).resolves.toMatchObject({
        confirmed: 2000000000n,
        unconfirmed: 2000000000n,
      })

      const asset = new Asset(accountA.publicAddress, 'mint-asset', 'metadata')

      const block3 = await useMintBlockFixture({
        node,
        account: accountA,
        asset,
        value: 10n,
      })
      await node.chain.addBlock(block3)
      await node.wallet.scan()

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

    it('should calculate available balance from pending transactions', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      const balanceA = await accountA.getBalance(Asset.nativeId(), 0)

      expect(balanceA).toMatchObject({
        confirmed: 2000000000n,
        unconfirmed: 2000000000n,
        available: 2000000000n,
        availableNoteCount: 1,
      })

      await useTxFixture(node.wallet, accountA, accountB)

      await expect(accountA.getBalance(Asset.nativeId(), 0)).resolves.toMatchObject({
        pending: balanceA.unconfirmed - 1n,
        pendingCount: 1,
        available: 0n,
        availableNoteCount: 0,
      })
    })

    it('should calculate available balance from unconfirmed transactions', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      await expect(accountA.getBalance(Asset.nativeId(), 0)).resolves.toMatchObject({
        confirmed: 2000000000n,
        unconfirmed: 2000000000n,
        available: 2000000000n,
        availableNoteCount: 1,
      })

      const { block: block3 } = await useBlockWithTx(node, accountA, accountB, false)
      await node.chain.addBlock(block3)
      await node.wallet.scan()

      // with 0 confirmations, available balance includes the transaction
      await expect(accountA.getBalance(Asset.nativeId(), 0)).resolves.toMatchObject({
        confirmed: 1999999998n,
        unconfirmed: 1999999998n,
        available: 1999999998n,
        availableNoteCount: 1,
      })

      // with 1 confirmation, available balance should not include the spent note or change
      await expect(accountA.getBalance(Asset.nativeId(), 1)).resolves.toMatchObject({
        confirmed: 2000000000n,
        unconfirmed: 1999999998n,
        available: 0n,
        availableNoteCount: 0,
      })
    })

    it('should calculate available balance from pending and unconfirmed transactions', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.scan()
      const block3 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block3)
      await node.wallet.scan()

      await expect(accountA.getBalance(Asset.nativeId(), 0)).resolves.toMatchObject({
        confirmed: 4000000000n,
        unconfirmed: 4000000000n,
        available: 4000000000n,
        availableNoteCount: 2,
      })

      const { block: block4 } = await useBlockWithTx(node, accountA, accountB, false)
      await node.chain.addBlock(block4)
      await node.wallet.scan()

      // with 0 confirmations, available balance includes the transaction
      await expect(accountA.getBalance(Asset.nativeId(), 0)).resolves.toMatchObject({
        confirmed: 3999999998n,
        unconfirmed: 3999999998n,
        available: 3999999998n,
        availableNoteCount: 2,
      })

      // with 1 confirmation, available balance should not include the spent note or change
      await expect(accountA.getBalance(Asset.nativeId(), 1)).resolves.toMatchObject({
        confirmed: 4000000000n,
        unconfirmed: 3999999998n,
        available: 2000000000n,
        availableNoteCount: 1,
      })

      // set confirmations to 1 so that new transaction can only spend the last note
      node.config.set('confirmations', 1)

      // create a pending transaction sending 1 $ORE from A to B
      await useTxFixture(node.wallet, accountA, accountB)

      // with 1 confirmation, all available notes have been spent in unconfirmed or pending transactions
      await expect(accountA.getBalance(Asset.nativeId(), 1)).resolves.toMatchObject({
        confirmed: 4000000000n,
        unconfirmed: 3999999998n,
        pending: 3999999997n,
        available: 0n,
        availableNoteCount: 0,
        pendingCount: 1,
        unconfirmedCount: 1,
      })
    })

    it('should calculate balances on a chain with no confirmed blocks', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      await node.wallet.scan()

      // balances should be 0 with no blocks added after genesis block
      // confirmations greater than chain length
      await expect(accountA.getBalance(Asset.nativeId(), 2)).resolves.toMatchObject({
        confirmed: 0n,
        unconfirmed: 0n,
        pending: 0n,
        available: 0n,
        availableNoteCount: 0,
      })

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      // with no confirmations, balances equal to miner reward
      await expect(accountA.getBalance(Asset.nativeId(), 0)).resolves.toMatchObject({
        confirmed: 2000000000n,
        unconfirmed: 2000000000n,
        pending: 2000000000n,
        available: 2000000000n,
        availableNoteCount: 1,
      })

      // confirmed and available balances should be 0 if block is unconfirmed
      // confirmations greater than chain length
      await expect(accountA.getBalance(Asset.nativeId(), 3)).resolves.toMatchObject({
        confirmed: 0n,
        unconfirmed: 2000000000n,
        pending: 2000000000n,
        available: 0n,
        availableNoteCount: 0,
      })
    })
  })

  describe('getPendingDelta', () => {
    it('should calculate pending delta from pending transactions', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

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
        accountA['getPendingDelta'](headA?.sequence, Asset.nativeId()),
      ).resolves.toMatchObject({
        delta: -1n,
        count: 1,
      })
    })
  })

  describe('getPendingDeltas', () => {
    it('should calculate pending deltas from pending transactions for all assets', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')
      const accountB = await useAccountFixture(node.wallet, 'accountB')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.scan()
      const block3 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block3)
      await node.wallet.scan()

      const balanceA = await accountA.getBalance(Asset.nativeId(), 0)

      expect(balanceA).toMatchObject({
        confirmed: 4000000000n,
        unconfirmed: 4000000000n,
      })

      const headA = await accountA.getHead()

      Assert.isNotNull(headA)

      expect(headA).toMatchObject({
        hash: block3.header.hash,
        sequence: block3.header.sequence,
      })

      await useTxFixture(node.wallet, accountA, accountB)

      const asset = new Asset(accountA.publicAddress, 'mint-asset', 'metadata')

      await useMintBlockFixture({
        node,
        account: accountA,
        asset,
        value: 10n,
      })

      const pendingDeltas = await accountA['getPendingDeltas'](headA?.sequence)

      // mint transaction has 0 fee, so no delta for the native asset
      expect(pendingDeltas.get(Asset.nativeId())).toMatchObject({ delta: -1n, count: 1 })
      expect(pendingDeltas.get(asset.id())).toMatchObject({ delta: 10n, count: 1 })
    })
  })

  describe('getUnconfirmedDeltas', () => {
    it('should calculate deltas from unconfirmed transactions for all assets', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const block2 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      const balanceA = await accountA.getBalance(Asset.nativeId(), 0)

      expect(balanceA).toMatchObject({
        confirmed: 2000000000n,
        unconfirmed: 2000000000n,
      })

      const asset = new Asset(accountA.publicAddress, 'mint-asset', 'metadata')

      const block3 = await useMintBlockFixture({
        node,
        account: accountA,
        asset,
        value: 10n,
      })
      await node.chain.addBlock(block3)
      await node.wallet.scan()

      const unconfirmedDeltas = await accountA['getUnconfirmedDeltas'](3, 1)

      // mint transaction has no fee, so no delta for the native asset
      expect(unconfirmedDeltas.get(asset.id())).toMatchObject({ delta: 10n, count: 1 })
    })
  })

  describe('expireTransaction', () => {
    it('removes the nullifier to transaction hash if we are expiring the matching hash', async () => {
      const { node } = nodeTest

      const account = await useAccountFixture(node.wallet)
      const block = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
      await node.chain.addBlock(block)
      await node.wallet.scan()

      // Add a pending transaction and check the nullifier
      const transaction = await useTxFixture(node.wallet, account, account)
      const nullifier = transaction.getSpend(0).nullifier
      const transactionHash = await account['walletDb'].getTransactionHashFromNullifier(
        account,
        nullifier,
      )
      expect(transactionHash).toEqual(transaction.hash())

      // Verify the note is spent before expiration
      const noteHash = await account.getNoteHash(nullifier)
      Assert.isNotUndefined(noteHash)
      let decryptedNote = await account.getDecryptedNote(noteHash)
      Assert.isNotUndefined(decryptedNote)
      expect(decryptedNote.spent).toBe(true)

      // Verify the mapping is gone after expiration
      await account.expireTransaction(transaction)
      expect(
        await account['walletDb'].getTransactionHashFromNullifier(account, nullifier),
      ).toBeUndefined()

      // Verify the note is unspent after expiration
      decryptedNote = await account.getDecryptedNote(noteHash)
      Assert.isNotUndefined(decryptedNote)
      expect(decryptedNote.spent).toBe(false)
    })

    it('does not update the nullifier to transaction hash mapping if the hash does not match', async () => {
      const { node: nodeA } = await nodeTest.createSetup()
      const { node: nodeB } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(nodeA.wallet, 'accountA')
      const accountB = await nodeB.wallet.importAccount(accountA)

      // Ensure both nodes for the same account have the same note
      const block = await useMinerBlockFixture(nodeA.chain, undefined, accountA, nodeA.wallet)
      await nodeA.chain.addBlock(block)
      await nodeA.wallet.scan()
      await nodeB.chain.addBlock(block)
      await nodeB.wallet.scan()

      // Spend the same note in both nodes
      const transactionA = await useTxFixture(nodeA.wallet, accountA, accountA)
      const transactionB = await useTxFixture(nodeB.wallet, accountB, accountB)

      // Add the pending transaction from Node B but ensure we have the original hash
      await nodeA.wallet.addPendingTransaction(transactionB)
      const nullifier = transactionB.getSpend(0).nullifier
      let transactionHash = await accountA['walletDb'].getTransactionHashFromNullifier(
        accountA,
        nullifier,
      )
      expect(transactionHash).toEqual(transactionA.hash())

      // Verify the note is spent before expiration
      const noteHash = await accountA.getNoteHash(nullifier)
      Assert.isNotUndefined(noteHash)
      let decryptedNote = await accountA.getDecryptedNote(noteHash)
      Assert.isNotUndefined(decryptedNote)
      expect(decryptedNote.spent).toBe(true)

      // Expire Transaction B but ensure we still have the nullifier to transaction hash mapping
      await accountA.expireTransaction(transactionB)
      transactionHash = await accountA['walletDb'].getTransactionHashFromNullifier(
        accountA,
        nullifier,
      )
      expect(transactionHash).toEqual(transactionA.hash())

      // Verify the note is still spent since we expired a different transaction
      decryptedNote = await accountA.getDecryptedNote(noteHash)
      Assert.isNotUndefined(decryptedNote)
      expect(decryptedNote.spent).toBe(true)
    })

    it('should add spent notes back into unspentNoteHashes', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const block2 = await useMinerBlockFixture(node.chain, 2, accountA)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      let unspentHashes = await AsyncUtils.materialize(
        accountA['walletDb'].loadUnspentNoteHashes(accountA, Asset.nativeId()),
      )
      expect(unspentHashes).toHaveLength(1)
      const unspentHash = unspentHashes[0]

      const transaction = await useTxFixture(node.wallet, accountA, accountA)

      unspentHashes = await AsyncUtils.materialize(
        accountA['walletDb'].loadUnspentNoteHashes(accountA, Asset.nativeId()),
      )
      expect(unspentHashes).toHaveLength(0)

      await accountA.expireTransaction(transaction)

      unspentHashes = await AsyncUtils.materialize(
        accountA['walletDb'].loadUnspentNoteHashes(accountA, Asset.nativeId()),
      )
      expect(unspentHashes).toHaveLength(1)
      expect(unspentHash).toEqualBuffer(unspentHashes[0])
    })
  })

  describe('getUnspentNotes', () => {
    it('loads notes sorted by value', async () => {
      const { node } = nodeTest
      const account = await useAccountFixture(node.wallet)

      const minerBlockA = await useMinerBlockFixture(
        node.chain,
        undefined,
        account,
        node.wallet,
      )

      await node.chain.addBlock(minerBlockA)
      await node.wallet.scan()

      const minerBlockB = await useMinerBlockFixture(
        node.chain,
        undefined,
        account,
        node.wallet,
      )

      await node.chain.addBlock(minerBlockB)
      await node.wallet.scan()

      const block = await useMinerBlockFixture(node.chain, undefined, account, node.wallet, [
        await useTxFixture(node.wallet, account, account, undefined, 1n),
        await useTxFixture(node.wallet, account, account, undefined, 10n),
      ])
      await node.chain.addBlock(block)
      await node.wallet.scan()

      const sortedNotes = await AsyncUtils.materialize(
        account.getUnspentNotes(Asset.nativeId()),
      )

      const allUnspentNotes = await AsyncUtils.materialize(
        account.getUnspentNotes(Asset.nativeId()),
      )

      expect(sortedNotes.length).toEqual(allUnspentNotes.length)

      let previousNoteValue = sortedNotes[0].note.value()

      for (const note of sortedNotes) {
        expect(note.note.value()).toBeGreaterThanOrEqual(previousNoteValue)
        previousNoteValue = note.note.value()
      }

      // descending order
      const sortedNotesDescending = await AsyncUtils.materialize(
        account.getUnspentNotes(Asset.nativeId(), { reverse: true }),
      )
      previousNoteValue = sortedNotesDescending[0].note.value()

      for (const note of sortedNotesDescending) {
        expect(note.note.value()).toBeLessThanOrEqual(previousNoteValue)
        previousNoteValue = note.note.value()
      }
    })

    it('filters notes by confirmations', async () => {
      const { node } = nodeTest
      const account = await useAccountFixture(node.wallet)

      const getUnspentNotes = async (confirmations: number) => {
        return await AsyncUtils.materialize(
          account.getUnspentNotes(Asset.nativeId(), { confirmations }),
        )
      }

      const blockA = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
      await node.chain.addBlock(blockA)
      await node.wallet.scan()

      expect(await getUnspentNotes(1)).toHaveLength(0)

      expect(await getUnspentNotes(0)).toHaveLength(1)

      const blockB = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
      await node.chain.addBlock(blockB)
      await node.wallet.scan()

      expect(await getUnspentNotes(0)).toHaveLength(2)
      expect(await getUnspentNotes(1)).toHaveLength(1)
      expect(await getUnspentNotes(2)).toHaveLength(0)
    })

    it('sorted notes for minted assets', async () => {
      const { node } = nodeTest
      const accA = await useAccountFixture(node.wallet, 'accountA')
      const accB = await useAccountFixture(node.wallet, 'accountB')

      const minerBlockA = await useMinerBlockFixture(node.chain, undefined, accA, node.wallet)

      await node.chain.addBlock(minerBlockA)
      await node.wallet.scan()

      const transactionA = await useTxFixture(node.wallet, accA, accB)
      const block = await useMinerBlockFixture(node.chain, undefined, undefined, node.wallet, [
        transactionA,
      ])
      await node.chain.addBlock(block)
      await node.wallet.scan()

      const asset = new Asset(accA.publicAddress, 'mint-asset', 'metadata')

      const mintData = {
        creator: asset.creator().toString('hex'),
        name: asset.name().toString('utf8'),
        metadata: asset.metadata().toString('utf8'),
        value: 10n,
      }

      const mint = await usePostTxFixture({
        node: node,
        wallet: node.wallet,
        from: accA,
        mints: [mintData],
      })

      const mintBlock = await useMinerBlockFixture(
        node.chain,
        undefined,
        undefined,
        undefined,
        [mint],
      )
      await node.chain.addBlock(mintBlock)
      await node.wallet.scan()

      expect((await accA.getBalance(asset.id(), 0)).available).toBe(10n)

      for (let i = 0; i < 3; i++) {
        const transfer = await usePostTxFixture({
          node,
          wallet: node.wallet,
          from: accA,
          to: accB,
          assetId: asset.id(),
          amount: BigInt(i + 1),
        })
        const block = await useMinerBlockFixture(node.chain, undefined, accA, node.wallet, [
          transfer,
        ])
        await node.chain.addBlock(block)
        await node.wallet.scan()
      }

      expect((await accA.getBalance(asset.id(), 0)).available).toBe(4n)
      expect((await accB.getBalance(asset.id(), 0)).available).toBe(6n)

      const sortedAssetNotes = await AsyncUtils.materialize(
        accB.getUnspentNotes(asset.id(), {
          confirmations: 0,
          reverse: true,
        }),
      )
      const values = sortedAssetNotes.map((note) => note.note.value())

      expect(sortedAssetNotes).toHaveLength(3)
      expect(values).toEqual([3n, 2n, 1n])
    })

    it('loads all unspent notes with no confirmation range', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const block2 = await useMinerBlockFixture(node.chain, 2, accountA)
      await node.chain.addBlock(block2)
      await node.wallet.scan()
      const block3 = await useMinerBlockFixture(node.chain, 2, accountA)
      await node.chain.addBlock(block3)
      await node.wallet.scan()

      const unspentNotes = await AsyncUtils.materialize(
        accountA.getUnspentNotes(Asset.nativeId()),
      )

      expect(unspentNotes).toHaveLength(2)
    })

    it('filters unspent notes by confirmation range', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const block2 = await useMinerBlockFixture(node.chain, 2, accountA)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      let unspentNotes = await AsyncUtils.materialize(
        accountA.getUnspentNotes(Asset.nativeId(), { confirmations: 0 }),
      )

      expect(unspentNotes).toHaveLength(1)

      unspentNotes = await AsyncUtils.materialize(
        accountA.getUnspentNotes(Asset.nativeId(), { confirmations: 1 }),
      )

      expect(unspentNotes).toHaveLength(0)
    })

    it('filters unspent notes by assetId', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const block2 = await useMinerBlockFixture(node.chain, 2, accountA)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      const asset = new Asset(accountA.publicAddress, 'mint-asset', 'metadata')
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

      let unspentNotes = await AsyncUtils.materialize(
        accountA.getUnspentNotes(Asset.nativeId(), { confirmations: 0 }),
      )

      expect(unspentNotes).toHaveLength(1)

      unspentNotes = await AsyncUtils.materialize(
        accountA.getUnspentNotes(asset.id(), { confirmations: 0 }),
      )

      expect(unspentNotes).toHaveLength(1)
    })

    it('should load no unspent notes with no confirmed blocks', async () => {
      const { node } = nodeTest

      const accountA = await useAccountFixture(node.wallet, 'accountA')

      const block2 = await useMinerBlockFixture(node.chain, 2, accountA)
      await node.chain.addBlock(block2)
      await node.wallet.scan()

      let unspentNotes = await AsyncUtils.materialize(
        accountA.getUnspentNotes(Asset.nativeId(), { confirmations: 0 }),
      )

      expect(unspentNotes).toHaveLength(1)

      unspentNotes = await AsyncUtils.materialize(
        accountA.getUnspentNotes(Asset.nativeId(), {
          confirmations: node.chain.head.sequence + 1,
        }),
      )

      expect(unspentNotes).toHaveLength(0)
    })
  })

  describe('getTransactionsByTime', () => {
    it('loads multiple transactions on a block for an account', async () => {
      const { node: nodeA } = await nodeTest.createSetup()
      const { node: nodeB } = await nodeTest.createSetup()

      // create accounts on separate nodes so that accountB doesn't see pending transactions
      const accountA = await useAccountFixture(nodeA.wallet, 'accountA')
      const accountB = await useAccountFixture(nodeB.wallet, 'accountB')

      // mine two blocks to give accountA notes for two transactions
      const block2 = await useMinerBlockFixture(nodeA.chain, 2, accountA)
      await nodeA.chain.addBlock(block2)
      await nodeB.chain.addBlock(block2)

      const block3 = await useMinerBlockFixture(nodeA.chain, 3, accountA)
      await nodeA.chain.addBlock(block3)
      await nodeB.chain.addBlock(block3)
      await nodeA.wallet.scan()
      await nodeB.wallet.scan()

      // create two transactions from A to B
      const tx1 = await useTxFixture(nodeA.wallet, accountA, accountB)
      const tx2 = await useTxFixture(nodeA.wallet, accountA, accountB)

      // mine a block that includes both transactions
      const block4 = await useMinerBlockFixture(nodeA.chain, 4, accountA, undefined, [tx1, tx2])
      await nodeA.chain.addBlock(block4)
      await nodeB.chain.addBlock(block4)
      await nodeA.wallet.scan()
      await nodeB.wallet.scan()

      // getTransactionsByTime returns transactions in reverse order by time, hash
      const accountATx = await AsyncUtils.materialize(accountA.getTransactionsByTime())
      const accountBTx = await AsyncUtils.materialize(accountB.getTransactionsByTime())

      // 3 block rewards plus 2 outgoing transactions
      expect(accountATx).toHaveLength(5)

      const accountATxHashes = accountATx.map((tx) => tx.transaction.hash().toString('hex'))

      expect(accountATxHashes).toContain(tx2.hash().toString('hex'))
      expect(accountATxHashes).toContain(tx1.hash().toString('hex'))
      expect(accountATxHashes).toContain(block4.transactions[0].hash().toString('hex'))
      expect(accountATxHashes).toContain(block3.transactions[0].hash().toString('hex'))
      expect(accountATxHashes).toContain(block2.transactions[0].hash().toString('hex'))

      // 2 transactions from block4
      expect(accountBTx).toHaveLength(2)

      // tx1 and tx2 will have the same timestamp for accountB, so ordering should be reverse by hash
      const sortedHashes = [tx1.hash(), tx2.hash()].sort((a, b) => b.compare(a))

      expect(accountBTx[0].transaction.hash()).toEqualHash(sortedHashes[0])
      expect(accountBTx[1].transaction.hash()).toEqualHash(sortedHashes[1])

      // It also allows us to return transactions in chronological order
      // getTransactionsByTime returns transactions in reverse order by time, hash
      const accountATxChronological = await AsyncUtils.materialize(
        accountA.getTransactionsByTime(undefined, { reverse: false }),
      )
      const accountBTxChronological = await AsyncUtils.materialize(
        accountB.getTransactionsByTime(undefined, { reverse: false }),
      )

      // 3 block rewards plus 2 outgoing transactions
      expect(accountATxChronological).toHaveLength(5)

      // tx1 and tx2 will have the same timestamp for accountB, so ordering should be reverse by hash
      const sortedHashesChron = [tx1.hash(), tx2.hash()].sort((a, b) => a.compare(b))

      expect(accountBTxChronological[0].transaction.hash()).toEqualHash(sortedHashesChron[0])
      expect(accountBTxChronological[1].transaction.hash()).toEqualHash(sortedHashesChron[1])
    })
  })

  describe('getTransactionsBySequence', () => {
    it('returns a stream of transactions with a matching block sequence', async () => {
      const { node } = nodeTest
      const account = await useAccountFixture(node.wallet)

      const minerBlockA = await useMinerBlockFixture(
        node.chain,
        undefined,
        account,
        node.wallet,
      )
      await node.chain.addBlock(minerBlockA)
      await node.wallet.scan()

      const minerBlockB = await useMinerBlockFixture(
        node.chain,
        undefined,
        account,
        node.wallet,
      )
      await node.chain.addBlock(minerBlockB)
      await node.wallet.scan()

      const transactionA = await useTxFixture(node.wallet, account, account)
      const transactionB = await useTxFixture(node.wallet, account, account)

      const block = await useMinerBlockFixture(node.chain, undefined, account, node.wallet, [
        transactionA,
        transactionB,
      ])
      await node.chain.addBlock(block)
      await node.wallet.scan()

      const blockTransactionHashes = block.transactions
        .map((transaction) => transaction.hash())
        .sort()
      const accountTransactions = await AsyncUtils.materialize(
        account.getTransactionsBySequence(block.header.sequence),
      )
      const accountTransactionHashes = accountTransactions
        .map(({ transaction }) => transaction.hash())
        .sort()
      expect(accountTransactionHashes).toEqual(blockTransactionHashes)
    })
  })

  describe('encrypt', () => {
    it('returns an encrypted account that can be decrypted into the original account', async () => {
      const { node } = nodeTest
      const account = await useAccountFixture(node.wallet)
      const passphrase = 'foo'

      const masterKey = MasterKey.generate(passphrase)
      await masterKey.unlock(passphrase)
      const encryptedAccount = account.encrypt(masterKey)

      const decryptedAccount = encryptedAccount.decrypt(masterKey)

      expect(account.serialize()).toMatchObject(decryptedAccount.serialize())
    })
  })
})
