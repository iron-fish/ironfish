/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset, DECRYPTED_NOTE_LENGTH, initSignalHandler, LanguageCode, LATEST_TRANSACTION_VERSION, spendingKeyToWords, verifyTransactions, wordsToSpendingKey } from '..'
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
    expect(typeof key.incomingViewKey).toBe('string')
    expect(typeof key.outgoingViewKey).toBe('string')
    expect(typeof key.publicAddress).toBe('string')
    expect(typeof key.spendingKey).toBe('string')
  })

  it('Should be able to convert hex key to words, and reverse', () => {
    const hexKey = 'd56b241ca965b3997485ccf06421740c1d61163922ad1c02ee69fbe09253daf7'
    const hexKeyWords = 'step float already fan forest smile spirit ridge vacant canal fringe blouse stock mention tonight fiber bright blast omit water ankle clarify hint turn'
    const key = generateKeyFromPrivateKey(hexKey)
    const words = spendingKeyToWords(key.spendingKey, LanguageCode.English);
    expect(words).toEqual(hexKeyWords)

    const hexKeyGenerated = wordsToSpendingKey(words, LanguageCode.English);
    expect(hexKeyGenerated).toEqual(hexKey)
  })

  it('ViewKey concatenated key should be generated from spending key deterministically', () => {
    const hexSpendingKey = 'd96dc74bbca05dffb14a5631024588364b0cc9f583b5c11908b6ea98a2b778f7'
    const key = generateKeyFromPrivateKey(hexSpendingKey)
    // concatenated bytes of authorizing_key and nullifier_deriving_key
    expect(key.viewKey).toEqual('498b5103a72c41237c3f2bca96f20100f5a3a8a17c6b8366a485fd16e8931a5d2ff2eb8f991032c815414ff0ae2d8bc3ea3b56bffc481db3f28e800050244463')
  })

  it('Should generate a new public address given a spending key', () => {
    const key = generateKey()
    const newKey = generateKeyFromPrivateKey(key.spendingKey)

    expect(key.incomingViewKey).toEqual(newKey.incomingViewKey)
    expect(key.outgoingViewKey).toEqual(newKey.outgoingViewKey)
    expect(typeof newKey.publicAddress).toBe('string')
    expect(key.spendingKey).toEqual(newKey.spendingKey)
  })

  it(`Should create a miner's fee transaction`, () => {
    const key = generateKey()

    const transaction = new Transaction(LATEST_TRANSACTION_VERSION)
    const note = new Note(key.publicAddress, 20n, Buffer.from('test'), Asset.nativeId(), key.publicAddress)
    transaction.output(note)

    const serializedPostedTransaction = transaction.post_miners_fee(key.spendingKey)
    const postedTransaction = new TransactionPosted(serializedPostedTransaction)

    expect(postedTransaction.fee()).toEqual(-20n)
    expect(postedTransaction.notesLength()).toBe(1)
    expect(postedTransaction.spendsLength()).toBe(0)
    expect(postedTransaction.hash().byteLength).toBe(32)
    expect(postedTransaction.transactionSignature().byteLength).toBe(64)
    expect(verifyTransactions([postedTransaction.serialize()])).toBe(true)

    const encryptedNote = new NoteEncrypted(postedTransaction.getNote(0))
    expect(encryptedNote.hash().byteLength).toBe(32)
    expect(encryptedNote.equals(encryptedNote)).toBe(true)

    const decryptedNoteBuffer = encryptedNote.decryptNoteForOwner(Buffer.from(key.incomingViewKey, 'hex'))
    expect(decryptedNoteBuffer).toBeInstanceOf(Buffer)
    expect(decryptedNoteBuffer!.byteLength).toBe(DECRYPTED_NOTE_LENGTH)

    const decryptedSpenderNote = encryptedNote.decryptNoteForSpender(Buffer.from(key.outgoingViewKey, 'hex'))
    expect(decryptedSpenderNote).toBe(null)

    const decryptedNote = Note.deserialize(decryptedNoteBuffer!)

    // Null characters are included in the memo string
    expect(decryptedNote.memo().replace(/\0/g, '')).toEqual('test')
    expect(decryptedNote.value()).toEqual(20n)
    expect(decryptedNote.nullifier(key.viewKey, 0n).byteLength).toBeGreaterThan(0n)
  })

  it(`Should create a standard transaction`, () => {
    const key = generateKey()
    const recipientKey = generateKey()

    const minersFeeTransaction = new Transaction(LATEST_TRANSACTION_VERSION)
    const minersFeeNote = new Note(key.publicAddress, 20n, Buffer.from('miner'), Asset.nativeId(), key.publicAddress)
    minersFeeTransaction.output(minersFeeNote)

    const postedMinersFeeTransaction = new TransactionPosted(minersFeeTransaction.post_miners_fee(key.spendingKey))

    const transaction = new Transaction(LATEST_TRANSACTION_VERSION)
    transaction.setExpiration(10)
    const encryptedNote = new NoteEncrypted(postedMinersFeeTransaction.getNote(0))
    const decryptedNote = Note.deserialize(encryptedNote.decryptNoteForOwner(Buffer.from(key.incomingViewKey, 'hex'))!)
    const newNote = new Note(recipientKey.publicAddress, 15n, Buffer.from('receive'), Asset.nativeId(), minersFeeNote.owner())

    let currentHash = encryptedNote.hash()
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
    transaction.output(newNote)

    const postedTransaction = new TransactionPosted(transaction.post(key.spendingKey, key.publicAddress, 5n))

    expect(postedTransaction.expiration()).toEqual(10)
    expect(postedTransaction.fee()).toEqual(5n)
    expect(postedTransaction.notesLength()).toEqual(1)
    expect(postedTransaction.spendsLength()).toEqual(1)
    expect(postedTransaction.hash().byteLength).toEqual(32)
    expect(postedTransaction.transactionSignature().byteLength).toEqual(64)
    expect(verifyTransactions([postedTransaction.serialize()])).toBe(true)
  })
})

describe('signal catcher', () => {
  it('should be able to initialize the handler', () => {
    expect(() => initSignalHandler()).not.toThrow()
  })
})
