/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IncomingViewKey, isValidRandomness, partialDecrypt } from '@ironfish/rust-nodejs'
import { Assert } from '../assert'
import {
  useAccountFixture,
  useMinerBlockFixture,
  useTxFixture,
} from '../testUtilities/fixtures'
import { createNodeTest } from '../testUtilities/nodeTest'
import { Note } from './note'
import { NoteEncrypted } from './noteEncrypted'
import { Transaction } from './transaction'

describe('Note', () => {
  const nodeTest = createNodeTest()

  it('should post', async () => {
    const account = await useAccountFixture(nodeTest.wallet)
    const block = await useMinerBlockFixture(nodeTest.chain, undefined, account)

    const encrypted = block.minersFee.notes[0]
    const decrypted = encrypted.decryptNoteForOwner(account.incomingViewKey)

    Assert.isNotUndefined(decrypted)
    expect(encrypted.hash().equals(decrypted.hash())).toBe(true)
  })

  it('byte sizes should match', async () => {
    const account = await useAccountFixture(nodeTest.wallet)
    const block = await useMinerBlockFixture(nodeTest.chain, undefined, account)

    const encrypted = block.minersFee.notes[0]
    const decrypted = encrypted.decryptNoteForOwner(account.incomingViewKey)

    Assert.isNotUndefined(decrypted)
    expect(encrypted.serialize().byteLength).toBe(NoteEncrypted.size)
    expect(decrypted.serialize().byteLength).toBe(Note.size)
  })

  it('should be able to partially decrypt notes owned by account', async () => {
    const numTransactions = 10
    const owner = await useAccountFixture(nodeTest.wallet, 'owner')
    const spender = await useAccountFixture(nodeTest.wallet, 'spender')

    // fund account with enough notes for test
    for (let i = 0; i < numTransactions; i++) {
      const block = await useMinerBlockFixture(
        nodeTest.chain,
        undefined,
        spender,
        nodeTest.wallet,
      )
      await nodeTest.chain.addBlock(block)
      await nodeTest.wallet.updateHead()
    }

    const transactions: Transaction[] = []
    const expectedHashes: string[] = []
    // transactions where output is to decryptAccount
    for (let i = 0; i < numTransactions; i++) {
      const tx = await useTxFixture(nodeTest.wallet, spender, owner)
      expectedHashes.push(tx.hash().toString('hex'))
      transactions.push(tx)
    }

    // test block
    const testBlock = await useMinerBlockFixture(
      nodeTest.chain,
      undefined,
      owner,
      nodeTest.wallet,
      transactions,
    )

    const successfulDecryptions: string[] = []
    for (const transaction of testBlock.transactions) {
      const noteCipherText = transaction.notes[0].serialize().toString('hex')
      const noteEpk = noteCipherText.slice(64 * 2, 64 * 2 + 32 * 2)
      const noteRandomness = noteCipherText.slice(96 * 2, 96 * 2 + 32 * 2)

      // we need the shared secret to decrypt the note ciphertext
      const sharedSecretKey = new IncomingViewKey(owner.incomingViewKey).sharedSecretKey(
        noteEpk,
      )
      const partialDecrypted = partialDecrypt(sharedSecretKey, noteRandomness)

      // false positive rate ~6% of time
      if (isValidRandomness(partialDecrypted)) {
        successfulDecryptions.push(transaction.hash().toString('hex'))
      }
    }
    // check that all transactions that have notes sent to decryptAccount were successfully decrypted
    expectedHashes.forEach((expectedHash) => {
      expect(successfulDecryptions).toContain(expectedHash)
    })
  })
})
