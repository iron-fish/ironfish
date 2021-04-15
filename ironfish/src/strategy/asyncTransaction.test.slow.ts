/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  generateKey,
  generateNewPublicAddress,
  WasmNote,
  WasmTransactionPosted,
  Key,
} from 'ironfish-wasm-nodejs'
import AsyncTransaction from './asyncTransaction'
import { MerkleTree } from '../merkletree'
import { IDatabase } from '../storage'
import {
  IronfishNote,
  IronfishNoteEncrypted,
  IronfishTransaction,
  NoteHasher,
  WasmNoteEncryptedHash,
} from '.'
import { makeDb, makeDbName } from '../testUtilities/fake'
import { WorkerPool } from '../workerPool'

async function makeWasmStrategyTree({
  depth,
  name,
  database,
}: {
  depth?: number
  name?: string
  database?: IDatabase
} = {}): Promise<MerkleTree<IronfishNoteEncrypted, WasmNoteEncryptedHash, Buffer, Buffer>> {
  const openDb = !database

  if (!name) name = makeDbName()
  if (!database) database = makeDb(name)

  const tree = await MerkleTree.new(new NoteHasher(), database, name, depth)

  if (openDb) {
    await database.open()
  }

  return tree
}

type ThenArg<T> = T extends PromiseLike<infer U> ? U : T

describe('Demonstrates async transaction', () => {
  let tree: ThenArg<ReturnType<typeof makeWasmStrategyTree>>
  let receiverKey: Key
  let spenderKey: Key
  let minerNote: WasmNote
  let minerTransaction: IronfishTransaction
  let simpleTransaction: AsyncTransaction
  let publicTransaction: IronfishTransaction

  jest.setTimeout(1200000)

  beforeAll(async () => {
    // Pay the cost of setting up Sapling and the DB outside of any test
    tree = await makeWasmStrategyTree()
    spenderKey = generateKey()
  })

  describe('Can transact between two accounts', () => {
    it('Can create a miner reward', async () => {
      const owner = generateNewPublicAddress(spenderKey.spending_key).public_address

      minerNote = new WasmNote(owner, BigInt(42), '')
      const transaction = new AsyncTransaction()
      expect(
        await transaction.receive(
          spenderKey.spending_key,
          new IronfishNote(Buffer.from(minerNote.serialize())),
        ),
      ).toBe('')
      minerTransaction = await transaction.postMinersFee(new WorkerPool())
      expect(minerTransaction).toBeTruthy()
      expect(minerTransaction.notesLength()).toEqual(1)
    })

    it('Can verify the miner transaction', () => {
      const serializedTransaction = minerTransaction.serialize()
      const deserializedTransaction = WasmTransactionPosted.deserialize(serializedTransaction)
      expect(deserializedTransaction.verify()).toBeTruthy()
    })

    it('Can add the miner transaction note to the tree', async () => {
      for (let i = 0; i < minerTransaction.notesLength(); i++) {
        const note = minerTransaction.getNote(i)
        await tree.add(note)
      }
      const treeSize: number = await tree.size()
      expect(treeSize).toBeGreaterThan(0)
    })

    it('Can create a async transaction', () => {
      simpleTransaction = new AsyncTransaction()
      expect(simpleTransaction).toBeTruthy()
    })

    it('Can add a spend to the transaction', async () => {
      const witness = await tree.witness(0)
      if (witness == null) throw new Error('Witness should not be null')
      const result = await simpleTransaction.spend(
        spenderKey.spending_key,
        new IronfishNote(Buffer.from(minerNote.serialize())),
        witness,
      )
      expect(result).toEqual('')
    })

    it('Can add a receive to the transaction', async () => {
      receiverKey = generateKey()
      const receivingNote = new WasmNote(receiverKey.public_address, BigInt(40), '')
      const result = await simpleTransaction.receive(
        spenderKey.spending_key,
        new IronfishNote(Buffer.from(receivingNote.serialize())),
      )
      expect(result).toEqual('')
    })

    it('Can post the transaction', async () => {
      publicTransaction = await simpleTransaction.post(
        spenderKey.spending_key,
        null,
        BigInt(2),
        new WorkerPool(),
      )
      expect(publicTransaction).toBeTruthy()
    })

    it('Can verify the transaction', async () => {
      expect(publicTransaction.verify()).toBeTruthy()
      for (let i = 0; i < publicTransaction.notesLength(); i++) {
        await tree.add(publicTransaction.getNote(i))
      }
    })

    it('Exposes binding signature on the transaction', () => {
      const hex_signature = publicTransaction.transactionSignature().toString('hex')
      expect(hex_signature.length).toBe(128)
    })

    it('Exposes transaction hash', () => {
      expect(publicTransaction.transactionHash().length).toBe(32)
    })
  })

  describe('Finding notes to spend', () => {
    let receiverNote: IronfishNote
    const receiverWitnessIndex = 1
    let transaction: AsyncTransaction

    it('Decrypts and fails to decrypt notes', async () => {
      // Get the note we added in the previous example
      const latestNote = await tree.get(receiverWitnessIndex)

      // We should be able to decrypt the note as owned by the receiver
      const decryptedNote = latestNote.decryptNoteForOwner(receiverKey.incoming_view_key)
      expect(decryptedNote).toBeTruthy()
      if (!decryptedNote) throw new Error('DecryptedNote should be truthy')
      receiverNote = decryptedNote

      // If we can decrypt a note as owned by the receiver, the spender should not be able to decrypt it as owned
      expect(latestNote.decryptNoteForOwner(spenderKey.incoming_view_key)).toBeUndefined()

      // Nor should the receiver be able to decrypt it as spent
      expect(latestNote.decryptNoteForSpender(receiverKey.outgoing_view_key)).toBeUndefined()

      // However, the spender should be able to decrypt it as spent
      expect(latestNote.decryptNoteForSpender(spenderKey.outgoing_view_key)).toBeTruthy()
    })

    it('Can create a transaction', async () => {
      transaction = new AsyncTransaction()

      const witness = await tree.witness(receiverWitnessIndex)
      if (witness == null) throw new Error('Witness must not be null')

      expect(await transaction.spend(receiverKey.spending_key, receiverNote, witness)).toBe('')

      const noteForSpender = new WasmNote(spenderKey.public_address, BigInt(10), '')
      const serializedNoteForSpender = Buffer.from(noteForSpender.serialize())
      noteForSpender.free()
      const ironfishNoteForSpender = new IronfishNote(serializedNoteForSpender)

      const receiverNoteToSelf = new WasmNote(
        generateNewPublicAddress(receiverKey.spending_key).public_address,
        BigInt(29),
        '',
      )
      const serializedReceiverNote = Buffer.from(receiverNoteToSelf.serialize())
      receiverNoteToSelf.free()
      const ironfishReceiverNote = new IronfishNote(serializedReceiverNote)

      expect(await transaction.receive(receiverKey.spending_key, ironfishNoteForSpender)).toBe(
        '',
      )
      expect(await transaction.receive(receiverKey.spending_key, ironfishReceiverNote)).toBe('')
    })

    it('Can post a transaction', async () => {
      const postedTransaction = await transaction.post(
        receiverKey.spending_key,
        null,
        BigInt(1),
        new WorkerPool(),
      )
      expect(postedTransaction).toBeTruthy()
      expect(postedTransaction.verify()).toBeTruthy()
    })
  })
})
