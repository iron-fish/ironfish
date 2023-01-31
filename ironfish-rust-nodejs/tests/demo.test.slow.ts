/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset, DECRYPTED_NOTE_LENGTH, LanguageCode, spendingKeyToWords, wordsToSpendingKey } from '..'
import {
  initializeSapling,
  generateKey,
  generateKeyFromPrivateKey,
  Note,
  NoteEncrypted,
  Transaction,
  TransactionPosted,
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

  it('Should be able to convert hex key to words, and reverse', () => {
    const hexKey = 'd56b241ca965b3997485ccf06421740c1d61163922ad1c02ee69fbe09253daf7'
    const hexKeyWords = 'step float already fan forest smile spirit ridge vacant canal fringe blouse stock mention tonight fiber bright blast omit water ankle clarify hint turn'
    const key = generateKeyFromPrivateKey(hexKey)
    const words = spendingKeyToWords(key.spending_key, LanguageCode.English);
    expect(words).toEqual(hexKeyWords)

    const hexKeyGenerated = wordsToSpendingKey(words, LanguageCode.English);
    expect(hexKeyGenerated).toEqual(hexKey)
  })

  it('Should generate a new public address given a spending key', () => {
    const key = generateKey()
    const newKey = generateKeyFromPrivateKey(key.spending_key)

    expect(key.incoming_view_key).toEqual(newKey.incoming_view_key)
    expect(key.outgoing_view_key).toEqual(newKey.outgoing_view_key)
    expect(typeof newKey.public_address).toBe('string')
    expect(key.spending_key).toEqual(newKey.spending_key)
  })

  it(`Should create a miner's fee transaction`, () => {
    const key = generateKey()

    const transaction = new Transaction(key.spending_key)
    const note = new Note(key.public_address, BigInt(20), 'test', Asset.nativeId(), key.public_address)
    transaction.receive(note)

    const serializedPostedTransaction = transaction.post_miners_fee()
    const postedTransaction = new TransactionPosted(serializedPostedTransaction)

    expect(postedTransaction.fee()).toEqual(BigInt(-20))
    expect(postedTransaction.notesLength()).toBe(1)
    expect(postedTransaction.spendsLength()).toBe(0)
    expect(postedTransaction.hash().byteLength).toBe(32)
    expect(postedTransaction.transactionSignature().byteLength).toBe(64)
    expect(postedTransaction.verify()).toBe(true)

    const encryptedNote = new NoteEncrypted(postedTransaction.getNote(0))
    expect(encryptedNote.merkleHash().byteLength).toBe(32)
    expect(encryptedNote.equals(encryptedNote)).toBe(true)

    const decryptedNoteBuffer = encryptedNote.decryptNoteForOwner(key.incoming_view_key)
    expect(decryptedNoteBuffer).toBeInstanceOf(Buffer)
    expect(decryptedNoteBuffer!.byteLength).toBe(DECRYPTED_NOTE_LENGTH)

    const decryptedSpenderNote = encryptedNote.decryptNoteForSpender(key.outgoing_view_key)
    expect(decryptedSpenderNote).toBe(null)

    const decryptedNote = Note.deserialize(decryptedNoteBuffer!)

    // Null characters are included in the memo string
    expect(decryptedNote.memo().replace(/\0/g, '')).toEqual('test')
    expect(decryptedNote.value()).toEqual(BigInt(20))
    expect(decryptedNote.nullifier(key.spending_key, BigInt(0)).byteLength).toBeGreaterThan(BigInt(0))
  })

  it(`Should create a standard transaction`, () => {
    const key = generateKey()
    const recipientKey = generateKey()

    const minersFeeTransaction = new Transaction(key.spending_key)
    const minersFeeNote = new Note(key.public_address, BigInt(20), 'miner', Asset.nativeId(), key.public_address)
    minersFeeTransaction.receive(minersFeeNote)

    const postedMinersFeeTransaction = new TransactionPosted(minersFeeTransaction.post_miners_fee())

    const transaction = new Transaction(key.spending_key)
    transaction.setExpiration(10)
    const encryptedNote = new NoteEncrypted(postedMinersFeeTransaction.getNote(0))
    const decryptedNote = Note.deserialize(encryptedNote.decryptNoteForOwner(key.incoming_view_key)!)
    const newNote = new Note(recipientKey.public_address, BigInt(15), 'receive', Asset.nativeId(), minersFeeNote.owner())

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

    transaction.spend(decryptedNote, witness)
    transaction.receive(newNote)

    const postedTransaction = new TransactionPosted(transaction.post(key.public_address, BigInt(5)))

    expect(postedTransaction.expiration()).toEqual(10)
    expect(postedTransaction.fee()).toEqual(BigInt(5))
    expect(postedTransaction.notesLength()).toEqual(1)
    expect(postedTransaction.spendsLength()).toEqual(1)
    expect(postedTransaction.hash().byteLength).toEqual(32)
    expect(postedTransaction.transactionSignature().byteLength).toEqual(64)
    expect(postedTransaction.verify()).toBe(true)
  })
})
