/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  Asset,
  generateKey,
  generateKeyFromPrivateKey,
  Key,
  LATEST_TRANSACTION_VERSION,
  Note as NativeNote,
  Transaction as NativeTransaction,
  TransactionPosted as NativeTransactionPosted,
} from '@ironfish/rust-nodejs'
import { MerkleTree } from './merkletree'
import { LeafEncoding } from './merkletree/database/leaves'
import { NodeEncoding } from './merkletree/database/nodes'
import { NoteHasher } from './merkletree/hasher'
import { Transaction } from './primitives'
import { Note } from './primitives/note'
import { NoteEncrypted, NoteEncryptedHash } from './primitives/noteEncrypted'
import { BUFFER_ENCODING, IDatabase } from './storage'
import { makeDb, makeDbName } from './testUtilities/helpers/storage'
import { WorkerPool } from './workerPool'

async function makeStrategyTree({
  depth,
  name,
  database,
}: {
  depth?: number
  name?: string
  database?: IDatabase
} = {}): Promise<MerkleTree<NoteEncrypted, NoteEncryptedHash, Buffer, Buffer>> {
  const openDb = !database

  if (!name) {
    name = makeDbName()
  }
  if (!database) {
    database = makeDb(name)
  }

  const tree = new MerkleTree({
    hasher: new NoteHasher(),
    leafIndexKeyEncoding: BUFFER_ENCODING,
    leafEncoding: new LeafEncoding(),
    nodeEncoding: new NodeEncoding(),
    db: database,
    name: name,
    depth: depth,
    defaultValue: Buffer.alloc(32),
  })

  if (openDb) {
    await database.open()
  }

  return tree
}

/**
 * Tests whether it's possible to create a miner reward and transfer those funds
 * to another account using ironfish-rust transactions + strategy.
 *
 * This is an integration test dependent on order of execution of the `it`
 * blocks inside the test.
 */
describe('Demonstrate the Sapling API', () => {
  let tree: MerkleTree<NoteEncrypted, NoteEncryptedHash, Buffer, Buffer>
  let receiverKey: Key
  let spenderKey: Key
  let minerNote: NativeNote
  let minerTransaction: NativeTransactionPosted
  let transaction: NativeTransaction
  let publicTransaction: NativeTransactionPosted
  let workerPool: WorkerPool

  beforeAll(async () => {
    // Pay the cost of setting up Sapling and the DB outside of any test
    tree = await makeStrategyTree()
    spenderKey = generateKey()
    receiverKey = generateKey()
    workerPool = new WorkerPool()
  })

  describe('Can transact between two accounts', () => {
    it('Can create a miner reward', () => {
      const owner = generateKeyFromPrivateKey(spenderKey.spendingKey).publicAddress

      minerNote = new NativeNote(owner, 42n, Buffer.from(''), Asset.nativeId(), owner)

      const transaction = new NativeTransaction(LATEST_TRANSACTION_VERSION)
      transaction.output(minerNote)
      minerTransaction = new NativeTransactionPosted(
        transaction.post_miners_fee(spenderKey.spendingKey),
      )
      expect(minerTransaction).toBeTruthy()
      expect(minerTransaction.notesLength()).toEqual(1)
    })

    it('Has miner owner address as the miner reward sender address', () =>
      expect(minerNote.sender()).toBe(minerNote.owner()))

    it('Can verify the miner transaction', async () => {
      const serializedTransaction = minerTransaction.serialize()
      const deserializedTransaction = new Transaction(serializedTransaction)
      expect(await workerPool.verifyTransactions([deserializedTransaction])).toEqual({
        valid: true,
      })
    })

    it('Can add the miner transaction note to the tree', async () => {
      for (let i = 0; i < minerTransaction.notesLength(); i++) {
        const note = Buffer.from(minerTransaction.getNote(i))
        await tree.add(new NoteEncrypted(note))
      }
      const treeSize: number = await tree.size()
      expect(treeSize).toBeGreaterThan(0)
    })

    it('Can create a simple transaction', () => {
      transaction = new NativeTransaction(LATEST_TRANSACTION_VERSION)
      expect(transaction).toBeTruthy()
    })

    it('Can post the transaction', async () => {
      // Add a spend to the transaction
      const witness = await tree.witness(0)
      if (witness === null) {
        throw new Error('Witness should not be null')
      }
      transaction.spend(minerNote, witness)
      // Add an output to the transaction
      receiverKey = generateKey()
      const outputNote = new NativeNote(
        receiverKey.publicAddress,
        40n,
        Buffer.from(''),
        Asset.nativeId(),
        minerNote.owner(),
      )
      transaction.output(outputNote)

      publicTransaction = new NativeTransactionPosted(
        transaction.post(spenderKey.spendingKey, null, 0n),
      )

      expect(publicTransaction).toBeTruthy()
    })

    it('Can verify the transaction', async () => {
      const transaction = new Transaction(publicTransaction.serialize())
      expect(await workerPool.verifyTransactions([transaction])).toEqual({
        valid: true,
      })
      for (let i = 0; i < publicTransaction.notesLength(); i++) {
        const note = Buffer.from(publicTransaction.getNote(i))
        await tree.add(new NoteEncrypted(note))
      }
    })

    it('Exposes binding signature on the transaction', () => {
      const hex_signature = publicTransaction.transactionSignature().toString('hex')
      expect(hex_signature.toString().length).toBe(128)
    })

    it('Exposes transaction hash', () => {
      expect(publicTransaction.hash().length).toBe(32)
    })
  })

  describe('Finding notes to spend', () => {
    let receiverNote: Note
    const receiverWitnessIndex = 1
    let transaction: NativeTransaction

    it('Decrypts and fails to decrypt notes', async () => {
      // Get the note we added in the previous example
      const leaf = await tree.getLeaf(receiverWitnessIndex)
      const latestNote = new NoteEncrypted(publicTransaction.getNote(0))
      expect(leaf.merkleHash.equals(latestNote.hash())).toBe(true)

      // We should be able to decrypt the note as owned by the receiver
      const decryptedNote = latestNote.decryptNoteForOwner(receiverKey.incomingViewKey)
      expect(decryptedNote).toBeTruthy()
      if (!decryptedNote) {
        throw new Error('DecryptedNote should be truthy')
      }
      receiverNote = decryptedNote

      // If we can decrypt a note as owned by the receiver, the spender should not be able to decrypt it as owned
      expect(latestNote.decryptNoteForOwner(spenderKey.incomingViewKey)).toBeUndefined()

      // Nor should the receiver be able to decrypt it as spent
      expect(latestNote.decryptNoteForSpender(receiverKey.outgoingViewKey)).toBeUndefined()

      // However, the spender should be able to decrypt it as spent
      expect(latestNote.decryptNoteForSpender(spenderKey.outgoingViewKey)).toBeTruthy()
    })

    it('Can create and post a transaction', async () => {
      transaction = new NativeTransaction(LATEST_TRANSACTION_VERSION)

      const witness = await tree.witness(receiverWitnessIndex)
      if (witness === null) {
        throw new Error('Witness must not be null')
      }

      // The `transaction.spend` method is used to spend the note. The owner needs to sign the transaction
      // with their private key; this is how the note gets authorized to spend.
      const note = receiverNote.takeReference()
      transaction.spend(note, witness)
      receiverNote.returnReference()

      const receiverAddress = receiverKey.publicAddress
      const noteForSpender = new NativeNote(
        spenderKey.publicAddress,
        10n,
        Buffer.from(''),
        Asset.nativeId(),
        receiverAddress,
      )
      const receiverNoteToSelf = new NativeNote(
        receiverAddress,
        29n,
        Buffer.from(''),
        Asset.nativeId(),
        receiverAddress,
      )

      transaction.output(noteForSpender)
      transaction.output(receiverNoteToSelf)

      const postedTransaction = new Transaction(
        transaction.post(receiverKey.spendingKey, undefined, 1n),
      )
      expect(postedTransaction).toBeTruthy()
      expect(await workerPool.verifyTransactions([postedTransaction])).toEqual({ valid: true })
    })
  })
})
