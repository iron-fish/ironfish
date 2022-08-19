/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  generateKey,
  generateNewPublicAddress,
  Key,
  Note as NativeNote,
  Transaction as NativeTransaction,
  TransactionPosted as NativeTransactionPosted,
} from '@ironfish/rust-nodejs'
import { Verifier } from './consensus'
import { MerkleTree } from './merkletree'
import { NoteLeafEncoding } from './merkletree/database/leaves'
import { NodeEncoding } from './merkletree/database/nodes'
import { NoteHasher } from './merkletree/hasher'
import { Note } from './primitives/note'
import { NoteEncrypted, NoteEncryptedHash } from './primitives/noteEncrypted'
import { BUFFER_ENCODING, IDatabase } from './storage'
import { Strategy } from './strategy'
import { createNodeTest } from './testUtilities'
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
    leafEncoding: new NoteLeafEncoding(),
    nodeEncoding: new NodeEncoding(),
    db: database,
    name: name,
    depth: depth,
  })

  if (openDb) {
    await database.open()
  }

  return tree
}

type ThenArg<T> = T extends PromiseLike<infer U> ? U : T

/**
 * Tests whether it's possible to create a miner reward and transfer those funds
 * to another account using ironfish-rust transactions + strategy.
 *
 * This is an integration test dependent on order of execution of the `it`
 * blocks inside the test.
 */
describe('Demonstrate the Sapling API', () => {
  let tree: ThenArg<ReturnType<typeof makeStrategyTree>>
  let receiverKey: Key
  let spenderKey: Key
  let minerNote: NativeNote
  let minerTransaction: NativeTransactionPosted
  let transaction: NativeTransaction
  let publicTransaction: NativeTransactionPosted

  beforeAll(async () => {
    // Pay the cost of setting up Sapling and the DB outside of any test
    tree = await makeStrategyTree()
    spenderKey = generateKey()
  })

  describe('Verifies incoming messages', () => {
    const nodeTest = createNodeTest()

    it('Rejects incoming new transactions if fees are negative', async () => {
      // Generate a miner's fee transaction
      const workerPool = new WorkerPool()
      const strategy = new Strategy(workerPool)
      const minersFee = await strategy.createMinersFee(BigInt(0), 0, generateKey().spending_key)

      const verifier = new Verifier(nodeTest.chain, workerPool)

      expect(
        await verifier.verifyTransactionContextual(minersFee, nodeTest.chain.head),
      ).toMatchObject({
        valid: false,
      })
    }, 60000)
  })

  describe('Can transact between two accounts', () => {
    it('Can create a miner reward', () => {
      const owner = generateNewPublicAddress(spenderKey.spending_key).public_address

      minerNote = new NativeNote(owner, BigInt(42), '')

      const transaction = new NativeTransaction()
      expect(transaction.receive(spenderKey.spending_key, minerNote)).toBe('')
      minerTransaction = new NativeTransactionPosted(transaction.post_miners_fee())
      expect(minerTransaction).toBeTruthy()
      expect(minerTransaction.notesLength()).toEqual(1)
    })

    it('Can verify the miner transaction', () => {
      const serializedTransaction = minerTransaction.serialize()
      const deserializedTransaction = new NativeTransactionPosted(serializedTransaction)
      expect(deserializedTransaction.verify()).toBeTruthy()
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
      transaction = new NativeTransaction()
      expect(transaction).toBeTruthy()
    })

    it('Can add a spend to the transaction', async () => {
      const witness = await tree.witness(0)
      if (witness === null) {
        throw new Error('Witness should not be null')
      }
      const result = transaction.spend(spenderKey.spending_key, minerNote, witness)
      expect(result).toEqual('')
    })

    it('Can add a receive to the transaction', () => {
      receiverKey = generateKey()
      const receivingNote = new NativeNote(receiverKey.public_address, BigInt(40), '')
      const result = transaction.receive(spenderKey.spending_key, receivingNote)
      expect(result).toEqual('')
    })

    it('Can post the transaction', () => {
      publicTransaction = new NativeTransactionPosted(
        transaction.post(spenderKey.spending_key, null, BigInt(0)),
      )
      expect(publicTransaction).toBeTruthy()
    })

    it('Can verify the transaction', async () => {
      expect(publicTransaction.verify()).toBeTruthy()
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

  describe('Serializes and deserializes transactions', () => {
    it('Does not hold a posted transaction if no references are taken', async () => {
      // Generate a miner's fee transaction
      const workerPool = new WorkerPool()
      const strategy = new Strategy(workerPool)
      const minersFee = await strategy.createMinersFee(BigInt(0), 0, generateKey().spending_key)

      expect(minersFee['transactionPosted']).toBeNull()
      expect(await workerPool.verify(minersFee, { verifyFees: false })).toEqual({ valid: true })
      expect(minersFee['transactionPosted']).toBeNull()
    }, 60000)

    it('Holds a posted transaction if a reference is taken', async () => {
      // Generate a miner's fee transaction
      const strategy = new Strategy(new WorkerPool())
      const minersFee = await strategy.createMinersFee(BigInt(0), 0, generateKey().spending_key)

      await minersFee.withReference(async () => {
        expect(minersFee['transactionPosted']).not.toBeNull()

        expect(minersFee.notesLength()).toEqual(1)
        expect(minersFee['transactionPosted']).not.toBeNull()

        // Reference returning happens on the promise jobs queue, so use an await
        // to delay until reference returning is expected to happen
        return Promise.resolve()
      })

      expect(minersFee['transactionPosted']).toBeNull()
    }, 60000)

    it('Does not hold a note if no references are taken', async () => {
      // Generate a miner's fee transaction
      const key = generateKey()
      const strategy = new Strategy(new WorkerPool())
      const minersFee = await strategy.createMinersFee(BigInt(0), 0, key.spending_key)

      expect(minersFee['transactionPosted']).toBeNull()
      const noteIterator = minersFee.notes()
      expect(minersFee['transactionPosted']).toBeNull()

      let note: NoteEncrypted | null = null
      for (const n of noteIterator) {
        note = n
      }
      if (note === null) {
        throw new Error('Must have at least one note')
      }

      expect(note['noteEncrypted']).toBeNull()
      const decryptedNote = note.decryptNoteForOwner(key.incoming_view_key)
      expect(decryptedNote).toBeDefined()
      expect(note['noteEncrypted']).toBeNull()

      if (decryptedNote === undefined) {
        throw new Error('Note must be decryptable')
      }

      expect(decryptedNote['note']).toBeNull()
      expect(decryptedNote.value()).toBe(BigInt(2000000000))
      expect(decryptedNote['note']).toBeNull()
    }, 60000)
  })

  describe('Finding notes to spend', () => {
    let receiverNote: Note
    const receiverWitnessIndex = 1
    let transaction: NativeTransaction

    it('Decrypts and fails to decrypt notes', async () => {
      // Get the note we added in the previous example
      const latestNote = await tree.get(receiverWitnessIndex)

      // We should be able to decrypt the note as owned by the receiver
      const decryptedNote = latestNote.decryptNoteForOwner(receiverKey.incoming_view_key)
      expect(decryptedNote).toBeTruthy()
      if (!decryptedNote) {
        throw new Error('DecryptedNote should be truthy')
      }
      receiverNote = decryptedNote

      // If we can decrypt a note as owned by the receiver, the spender should not be able to decrypt it as owned
      expect(latestNote.decryptNoteForOwner(spenderKey.incoming_view_key)).toBeUndefined()

      // Nor should the receiver be able to decrypt it as spent
      expect(latestNote.decryptNoteForSpender(receiverKey.outgoing_view_key)).toBeUndefined()

      // However, the spender should be able to decrypt it as spent
      expect(latestNote.decryptNoteForSpender(spenderKey.outgoing_view_key)).toBeTruthy()
    })

    it('Can create a transaction', async () => {
      transaction = new NativeTransaction()

      const witness = await tree.witness(receiverWitnessIndex)
      if (witness === null) {
        throw new Error('Witness must not be null')
      }

      // The `transaction.spend` method is used to spend the note. The owner needs to sign the transaction
      // with their private key; this is how the note gets authorized to spend.
      const note = receiverNote.takeReference()
      expect(transaction.spend(receiverKey.spending_key, note, witness)).toBe('')
      receiverNote.returnReference()

      const noteForSpender = new NativeNote(spenderKey.public_address, BigInt(10), '')
      const receiverNoteToSelf = new NativeNote(
        generateNewPublicAddress(receiverKey.spending_key).public_address,
        BigInt(29),
        '',
      )

      expect(transaction.receive(receiverKey.spending_key, noteForSpender)).toBe('')
      expect(transaction.receive(receiverKey.spending_key, receiverNoteToSelf)).toBe('')
    })

    it('Can post a transaction', () => {
      const postedTransaction = new NativeTransactionPosted(
        transaction.post(receiverKey.spending_key, undefined, BigInt(1)),
      )
      expect(postedTransaction).toBeTruthy()
      expect(postedTransaction.verify()).toBeTruthy()
    })
  })
})
