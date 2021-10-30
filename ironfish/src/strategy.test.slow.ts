/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  generateKey,
  generateNewPublicAddress,
  Key,
  WasmNote,
  WasmSimpleTransaction,
  WasmTransaction,
  WasmTransactionPosted,
} from 'ironfish-wasm-nodejs'
import { Verifier } from './consensus'
import { MerkleTree } from './merkletree'
import { NoteHasher } from './merkletree/hasher'
import { Note } from './primitives/note'
import { NoteEncrypted, WasmNoteEncryptedHash } from './primitives/noteEncrypted'
import { IDatabase } from './storage'
import { Strategy } from './strategy'
import { createNodeTest } from './testUtilities'
import { makeDb, makeDbName } from './testUtilities/helpers/storage'
import { WorkerPool } from './workerPool'

async function makeWasmStrategyTree({
  depth,
  name,
  database,
}: {
  depth?: number
  name?: string
  database?: IDatabase
} = {}): Promise<MerkleTree<NoteEncrypted, WasmNoteEncryptedHash, Buffer, Buffer>> {
  const openDb = !database

  if (!name) {
    name = makeDbName()
  }
  if (!database) {
    database = makeDb(name)
  }

  const tree = new MerkleTree({
    hasher: new NoteHasher(),
    db: database,
    name: name,
    depth: depth,
  })

  if (openDb) {
    await database.open()
    await tree.upgrade()
  }

  return tree
}

type ThenArg<T> = T extends PromiseLike<infer U> ? U : T

/**
 * Tests whether it's possible to create a miner reward and transfer those funds
 * to another account using the Wasm transactions + strategy.
 *
 * This is an integration test dependent on order of execution of the `it`
 * blocks inside the test.
 */
describe('Demonstrate the Sapling API', () => {
  let tree: ThenArg<ReturnType<typeof makeWasmStrategyTree>>
  let receiverKey: Key
  let spenderKey: Key
  let minerNote: WasmNote
  let minerTransaction: WasmTransactionPosted
  let simpleTransaction: WasmSimpleTransaction
  let publicTransaction: WasmTransactionPosted

  beforeAll(async () => {
    // Pay the cost of setting up Sapling and the DB outside of any test
    tree = await makeWasmStrategyTree()
    spenderKey = generateKey()
  })

  describe('Verifies incoming messages', () => {
    const nodeTest = createNodeTest()

    it('Rejects incoming new transactions if fees are negative', async () => {
      // Generate a miner's fee transaction
      const strategy = new Strategy(new WorkerPool())
      const minersFee = await strategy.createMinersFee(BigInt(0), 0, generateKey().spending_key)

      const verifier = new Verifier(nodeTest.chain)

      expect(await verifier.verifyTransaction(minersFee)).toMatchObject({ valid: false })
    }, 60000)
  })

  describe('Can transact between two accounts', () => {
    it('Can create a miner reward', () => {
      const owner = generateNewPublicAddress(spenderKey.spending_key).public_address

      minerNote = new WasmNote(owner, BigInt(42), '')
      const transaction = new WasmTransaction()
      expect(transaction.receive(spenderKey.spending_key, minerNote)).toBe('')
      minerTransaction = transaction.post_miners_fee()
      expect(minerTransaction).toBeTruthy()
      expect(minerTransaction.notesLength).toEqual(1)
    })

    it('Can verify the miner transaction', () => {
      const serializedTransaction = minerTransaction.serialize()
      const deserializedTransaction = WasmTransactionPosted.deserialize(serializedTransaction)
      expect(deserializedTransaction.verify()).toBeTruthy()
    })

    it('Can add the miner transaction note to the tree', async () => {
      for (let i = 0; i < minerTransaction.notesLength; i++) {
        const note = Buffer.from(minerTransaction.getNote(i))
        await tree.add(new NoteEncrypted(note))
      }
      const treeSize: number = await tree.size()
      expect(treeSize).toBeGreaterThan(0)
    })

    it('Can create a simple transaction', () => {
      simpleTransaction = new WasmSimpleTransaction(spenderKey.spending_key, BigInt(0))
      expect(simpleTransaction).toBeTruthy()
    })

    it('Can add a spend to the transaction', async () => {
      const witness = await tree.witness(0)
      if (witness === null) {
        throw new Error('Witness should not be null')
      }
      const result = simpleTransaction.spend(minerNote, witness)
      expect(result).toEqual('')
    })

    it('Can add a receive to the transaction', () => {
      receiverKey = generateKey()
      const receivingNote = new WasmNote(receiverKey.public_address, BigInt(40), '')
      const result = simpleTransaction.receive(receivingNote)
      expect(result).toEqual('')
    })

    it('Can post the transaction', () => {
      publicTransaction = simpleTransaction.post()
      expect(publicTransaction).toBeTruthy()
    })

    it('Can verify the transaction', async () => {
      expect(publicTransaction.verify()).toBeTruthy()
      for (let i = 0; i < publicTransaction.notesLength; i++) {
        const note = Buffer.from(publicTransaction.getNote(i))
        await tree.add(new NoteEncrypted(note))
      }
    })

    it('Exposes binding signature on the transaction', () => {
      const hex_signature = Buffer.from(publicTransaction.transactionSignature).toString('hex')
      expect(hex_signature.toString().length).toBe(128)
    })

    it('Exposes transaction hash', () => {
      expect(publicTransaction.hash.length).toBe(32)
    })
  })

  describe('Serializes and deserializes transactions', () => {
    it('Does not hold a posted transaction if no references are taken', async () => {
      // Generate a miner's fee transaction
      const strategy = new Strategy(new WorkerPool())
      const minersFee = await strategy.createMinersFee(BigInt(0), 0, generateKey().spending_key)

      expect(minersFee['wasmTransactionPosted']).toBeNull()
      expect(await minersFee.verify({ verifyFees: false })).toEqual({ valid: true })
      expect(minersFee['wasmTransactionPosted']).toBeNull()
    }, 60000)

    it('Holds a posted transaction if a reference is taken', async () => {
      // Generate a miner's fee transaction
      const strategy = new Strategy(new WorkerPool())
      const minersFee = await strategy.createMinersFee(BigInt(0), 0, generateKey().spending_key)

      minersFee.withReference(() => {
        expect(minersFee['wasmTransactionPosted']).not.toBeNull()

        expect(minersFee.notesLength()).toEqual(1)
        expect(minersFee['wasmTransactionPosted']).not.toBeNull()
      })

      expect(minersFee['wasmTransactionPosted']).toBeNull()
    }, 60000)

    it('Does not hold a note if no references are taken', async () => {
      // Generate a miner's fee transaction
      const key = generateKey()
      const strategy = new Strategy(new WorkerPool())
      const minersFee = await strategy.createMinersFee(BigInt(0), 0, key.spending_key)

      expect(minersFee['wasmTransactionPosted']).toBeNull()
      const noteIterator = minersFee.notes()
      expect(minersFee['wasmTransactionPosted']).toBeNull()

      let note: NoteEncrypted | null = null
      for (const n of noteIterator) {
        note = n
      }
      if (note === null) {
        throw new Error('Must have at least one note')
      }

      expect(note['wasmNoteEncrypted']).toBeNull()
      const decryptedNote = note.decryptNoteForOwner(key.incoming_view_key)
      expect(decryptedNote).toBeDefined()
      expect(note['wasmNoteEncrypted']).toBeNull()

      if (decryptedNote === undefined) {
        throw new Error('Note must be decryptable')
      }

      expect(decryptedNote['wasmNote']).toBeNull()
      expect(decryptedNote.value()).toBe(BigInt(500000000))
      expect(decryptedNote['wasmNote']).toBeNull()
    }, 60000)
  })

  describe('Finding notes to spend', () => {
    let receiverNote: Note
    const receiverWitnessIndex = 1
    let transaction: WasmTransaction

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
      transaction = new WasmTransaction()

      const witness = await tree.witness(receiverWitnessIndex)
      if (witness === null) {
        throw new Error('Witness must not be null')
      }

      // The `transaction.spend` method is used to spend the note. The owner needs to sign the transaction
      // with their private key; this is how the note gets authorized to spend.
      const note = receiverNote.takeReference()
      expect(transaction.spend(receiverKey.spending_key, note, witness)).toBe('')
      receiverNote.returnReference()

      const noteForSpender = new WasmNote(spenderKey.public_address, BigInt(10), '')
      const receiverNoteToSelf = new WasmNote(
        generateNewPublicAddress(receiverKey.spending_key).public_address,
        BigInt(29),
        '',
      )

      expect(transaction.receive(receiverKey.spending_key, noteForSpender)).toBe('')
      expect(transaction.receive(receiverKey.spending_key, receiverNoteToSelf)).toBe('')
    })

    it('Can post a transaction', () => {
      const postedTransaction = transaction.post(receiverKey.spending_key, undefined, BigInt(1))
      expect(postedTransaction).toBeTruthy()
      expect(postedTransaction.verify()).toBeTruthy()
    })
  })
})

describe('Miners reward', () => {
  let strategy: Strategy

  beforeAll(() => {
    strategy = new Strategy(new WorkerPool())
  })

  // see https://ironfish.network/docs/whitepaper/4_mining#include-the-miner-reward-based-on-coin-emission-schedule
  // for more details
  it('miners reward is properly calculated for year 0-1', () => {
    let minersReward = strategy.miningReward(1)
    expect(minersReward).toBe(5 * 10 ** 8)

    minersReward = strategy.miningReward(100000)
    expect(minersReward).toBe(5 * 10 ** 8)
  })

  it('miners reward is properly calculated for year 1-2', () => {
    const minersReward = strategy.miningReward(2100001)
    expect(minersReward).toBe(475614712)
  })
})
