/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  generateKey,
  generateNewPublicAddress,
  initializeSapling,
  Note,
  NoteEncrypted,
  Transaction,
  TransactionPosted,
} from '@ironfish/rust-nodejs'
import { Assert } from './assert'

describe('Demonstrate the Sapling API', () => {
  beforeAll(async () => {
    // Pay the cost of setting up Sapling outside of any test
    initializeSapling()
  })

  it(`foo`, () => {
    const key = generateKey()
    const recipientKey = generateKey()

    const minersFeeTransaction = new Transaction()
    const minersFeeNote = new Note(key.public_address, BigInt(1000), 'miner')
    minersFeeTransaction.receive(key.spending_key, minersFeeNote)

    const postedMinersFeeTransaction = new TransactionPosted(
      minersFeeTransaction.post_miners_fee(),
    )

    const transaction = new Transaction()
    transaction.setExpirationSequence(10)
    const encryptedNote = new NoteEncrypted(postedMinersFeeTransaction.getNote(0))
    Assert.isNotUndefined(encryptedNote)
    const ivk = key.incoming_view_key
    const n = encryptedNote.decryptNoteForOwner(ivk)
    Assert.isNotUndefined(n)
    Assert.isNotNull(n)
    const decryptedNote = Note.deserialize(n)

    let currentHash = encryptedNote.merkleHash()
    const authPath = Array.from({ length: 32 }, (_, depth) => {
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

    const noteCount = 250
    transaction.spend(key.spending_key, decryptedNote, witness)
    for (let x = 0; x < noteCount; x += 1) {
      const newNote = new Note(recipientKey.public_address, BigInt(1), 'receive')
      transaction.receive(key.spending_key, newNote)
    }

    const postedTransaction = new TransactionPosted(
      transaction.post(key.spending_key, key.public_address, BigInt(5)),
    )

    expect(postedTransaction.expirationSequence()).toEqual(10)
    expect(postedTransaction.fee()).toEqual(BigInt(5))
    expect(postedTransaction.notesLength()).toEqual(noteCount + 1)
    expect(postedTransaction.spendsLength()).toEqual(1)
    expect(postedTransaction.hash().byteLength).toEqual(32)
    expect(postedTransaction.transactionSignature().byteLength).toEqual(64)
    const start = new Date().getTime()
    const v = postedTransaction.verify()
    const end = new Date().getTime() - start
    console.log('time', end)
    expect(v).toBe(true)
  })
    // it(`foo2`, () => {
    //   const key = generateKey()
    //   const recipientKey = generateKey()
  
    //   const minersFeeTransaction = new Transaction()
    //   const minersFeeNote = new Note(key.public_address, BigInt(20), 'miner')
    //   minersFeeTransaction.receive(key.spending_key, minersFeeNote)
  
    //   const postedMinersFeeTransaction = new TransactionPosted(
    //     minersFeeTransaction.post_miners_fee(),
    //   )
  
    //   const transaction = new Transaction()
    //   transaction.setExpirationSequence(10)
    //   const encryptedNote = new NoteEncrypted(postedMinersFeeTransaction.getNote(0))
    //   Assert.isNotUndefined(encryptedNote)
    //   const ivk = key.incoming_view_key
    //   const n = encryptedNote.decryptNoteForOwner(ivk)
    //   Assert.isNotUndefined(n)
    //   Assert.isNotNull(n)
    //   const decryptedNote = Note.deserialize(n)
  
    //   let currentHash = encryptedNote.merkleHash()
    //   const authPath = Array.from({ length: 32 }, (_, depth) => {
    //     const tempHash = currentHash
    //     const witnessNode = {
    //       side: () => 'Left',
    //       hashOfSibling: () => tempHash,
    //     }
    //     currentHash = NoteEncrypted.combineHash(depth, currentHash, currentHash)
    //     return witnessNode
    //   })
  
    //   const witness = {
    //     authPath: () => authPath,
    //     verify: () => true,
    //     treeSize: () => 1,
    //     serializeRootHash: () => currentHash,
    //   }
  
    //   const noteCount = 1
    //   transaction.spend(key.spending_key, decryptedNote, witness)
    //   for (let x = 0; x < noteCount; x += 1) {
    //     const newNote = new Note(recipientKey.public_address, BigInt(1), 'receive')
    //     transaction.receive(key.spending_key, newNote)
    //   }
  
    //   const postedTransaction = new TransactionPosted(
    //     transaction.post(key.spending_key, key.public_address, BigInt(5)),
    //   )
  
    //   expect(postedTransaction.expirationSequence()).toEqual(10)
    //   expect(postedTransaction.fee()).toEqual(BigInt(5))
    //   expect(postedTransaction.notesLength()).toEqual(2)
    //   expect(postedTransaction.spendsLength()).toEqual(1)
    //   expect(postedTransaction.hash().byteLength).toEqual(32)
    //   expect(postedTransaction.transactionSignature().byteLength).toEqual(64)
    //   const start = new Date().getTime()
    //   const v = postedTransaction.verify()
    //   const end = new Date().getTime() - start
    //   console.log('time', end)
    //   expect(v).toBe(true)
    // })
})
