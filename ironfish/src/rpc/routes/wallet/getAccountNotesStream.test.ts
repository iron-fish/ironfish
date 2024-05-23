/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BufferMap } from 'buffer-map'
import { Assert } from '../../../assert'
import { useAccountFixture, useBlockWithTx } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { AsyncUtils, BufferUtils, CurrencyUtils } from '../../../utils'
import { DecryptedNoteValue } from '../../../wallet/walletdb/decryptedNoteValue'

describe('Route wallet/getAccountNotesStream', () => {
  const routeTest = createRouteTest(true)

  it('streams notes for an account', async () => {
    const node = routeTest.node
    const account = await useAccountFixture(node.wallet)

    const { previous, block, transaction } = await useBlockWithTx(node, account, account)
    await expect(node.chain).toAddBlock(block)
    await node.wallet.scan()

    const response = routeTest.client.wallet.getAccountNotesStream({
      account: account.name,
    })

    const expectedNotesByHash: BufferMap<DecryptedNoteValue> =
      new BufferMap<DecryptedNoteValue>()

    // account will have notes from previous, the block used to fund the
    // transaction, and from the transaction
    for (const note of [...previous.transactions[0].notes, ...transaction.notes]) {
      const decryptedNote = await account.getDecryptedNote(note.hash())

      Assert.isNotUndefined(decryptedNote)

      expectedNotesByHash.set(note.hash(), decryptedNote)
    }

    const notes = await AsyncUtils.materialize(response.contentStream())
    expect(notes).toHaveLength(expectedNotesByHash.size)

    for (const note of notes) {
      const expectedNote = expectedNotesByHash.get(Buffer.from(note.noteHash, 'hex'))

      Assert.isNotUndefined(expectedNote)

      expect(note.value).toEqual(CurrencyUtils.encode(expectedNote.note.value()))
      expect(note.assetId).toEqual(expectedNote.note.assetId().toString('hex'))
      expect(note.memo).toEqual(BufferUtils.toHuman(expectedNote.note.memo()))
      expect(note.sender).toEqual(expectedNote.note.sender())
      expect(note.owner).toEqual(expectedNote.note.owner())
      expect(note.noteHash).toEqual(expectedNote.note.hash().toString('hex'))
      expect(note.transactionHash).toEqual(expectedNote.transactionHash.toString('hex'))
      expect(note.index).toEqual(expectedNote.index)
      expect(note.nullifier).toEqual(expectedNote.nullifier?.toString('hex'))
      expect(note.spent).toEqual(expectedNote.spent)
      expect(note.isOwner).toBe(true)
      expect(note.hash).toEqual(expectedNote.note.hash().toString('hex'))
    }
  })
})
