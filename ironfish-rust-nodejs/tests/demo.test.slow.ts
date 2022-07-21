/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  initializeSapling,
  generateKey,
  generateNewPublicAddress,
  Note,
  NoteEncrypted,
  Transaction,
  TransactionPosted,
  MinersFeeTransaction,
} from '../'

describe('Demonstrate the Sapling API', () => {
  beforeAll(async () => {
    // Pay the cost of setting up Sapling outside of any test
    initializeSapling()
  })

  it('Should generate a key', () => {
    const key = generateKey()
    expect(typeof key.incoming_view_key).toBe('string')
    expect(typeof key.outgoing_view_key).toBe('string')
    expect(typeof key.public_address).toBe('string')
    expect(typeof key.spending_key).toBe('string')
  })

  it('Should generate a new public address given a spending key', () => {
    const key = generateKey()
    const newKey = generateNewPublicAddress(key.spending_key)

    expect(key.incoming_view_key).toEqual(newKey.incoming_view_key)
    expect(key.outgoing_view_key).toEqual(newKey.outgoing_view_key)
    expect(typeof newKey.public_address).toBe('string')
    expect(key.spending_key).toEqual(newKey.spending_key)
  })

  it(`Should create a miner's fee transaction`, () => {
    const key = generateKey()

    const note = new Note(key.public_address, BigInt(20), 'test', Note.getDefaultAssetIdentifier())
    const transaction = new MinersFeeTransaction(key.spending_key, note)

    expect(transaction.fee()).toEqual(BigInt(-20))
    expect(transaction.hash().byteLength).toBe(32)
    expect(transaction.signature().byteLength).toBe(64)
    expect(transaction.verify()).toBe(true)

    const encryptedNote = new NoteEncrypted(transaction.getNote())
    expect(encryptedNote.merkleHash().byteLength).toBe(32)
    expect(encryptedNote.equals(encryptedNote)).toBe(true)

    const decryptedNoteBuffer = encryptedNote.decryptNoteForOwner(key.incoming_view_key)
    expect(decryptedNoteBuffer).toBeInstanceOf(Buffer)
    expect(decryptedNoteBuffer.byteLength).toBe(147)

    const decryptedSpenderNote = encryptedNote.decryptNoteForSpender(key.outgoing_view_key)
    expect(decryptedSpenderNote).toBe(null)

    const decryptedNote = Note.deserialize(decryptedNoteBuffer)

    // Null characters are included in the memo string
    expect(decryptedNote.memo().replace(/\0/g, '')).toEqual('test')
    expect(decryptedNote.value()).toEqual(BigInt(20))
    expect(decryptedNote.nullifier(key.spending_key, BigInt(0)).byteLength).toBeGreaterThan(BigInt(0))
  })

  it(`Should create a standard transaction`, () => {
    const key = generateKey()
    const recipientKey = generateKey()

    const minersFeeNote = new Note(key.public_address, BigInt(20), 'miner', Note.getDefaultAssetIdentifier())
    const minersFeeTransaction = new MinersFeeTransaction(key.spending_key, minersFeeNote)

    const transaction = new Transaction()
    transaction.setExpirationSequence(10)
    const encryptedNote = new NoteEncrypted(minersFeeTransaction.getNote())
    const decryptedNote = Note.deserialize(encryptedNote.decryptNoteForOwner(key.incoming_view_key))
    const newNote = new Note(recipientKey.public_address, BigInt(15), 'receive', Note.getDefaultAssetIdentifier())

    let currentHash = encryptedNote.merkleHash()
    let authPath = Array.from({ length: 32 }, (_, depth) => {
      const tempHash = currentHash
      const witnessNode = {
        side: () => 'Left',
        hashOfSibling: () => tempHash,
      }
      currentHash = NoteEncrypted.combineHash(depth, currentHash, currentHash)
      return witnessNode
    })

    const witness = {
      authPath: () => authPath,
      verify: () => true,
      treeSize: () => 1,
      serializeRootHash: () => currentHash,
    }

    transaction.spend(key.spending_key, decryptedNote, witness)
    transaction.receive(key.spending_key, newNote)

    const postedTransaction = new TransactionPosted(transaction.post(key.spending_key, key.public_address, BigInt(5)))

    expect(postedTransaction.expirationSequence()).toEqual(10)
    expect(postedTransaction.fee()).toEqual(BigInt(5))
    expect(postedTransaction.notesLength()).toEqual(1)
    expect(postedTransaction.spendsLength()).toEqual(1)
    expect(postedTransaction.hash().byteLength).toEqual(32)
    expect(postedTransaction.transactionSignature().byteLength).toEqual(64)
    expect(postedTransaction.verify()).toBe(true)
  })
})
