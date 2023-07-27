/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../assert'
import { createNodeTest, useAccountFixture, useMinersTxFixture } from '../../testUtilities'
import { DecryptedNoteValue, DecryptedNoteValueEncoding } from './decryptedNoteValue'

describe('DecryptedNoteValueEncoding', () => {
  const nodeTest = createNodeTest()

  function expectDecryptedNoteValueToMatch(a: DecryptedNoteValue, b: DecryptedNoteValue): void {
    // Test transaction separately because it's not a primitive type
    expect(a.note.equals(b.note)).toBe(true)
    expect({ ...a, transaction: undefined }).toMatchObject({ ...b, transaction: undefined })
  }

  describe('with a null note index and nullifier hash', () => {
    it('serializes the object into a buffer and deserializes to the original object', async () => {
      const encoder = new DecryptedNoteValueEncoding()

      const account = await useAccountFixture(nodeTest.wallet)
      const transaction = await useMinersTxFixture(nodeTest.node, account)
      const note = transaction.getNote(0).decryptNoteForOwner(account.incomingViewKey)
      Assert.isNotUndefined(note)

      const value: DecryptedNoteValue = {
        accountId: 'uuid',
        index: null,
        nullifier: null,
        spent: false,
        note,
        transactionHash: Buffer.alloc(32, 1),
        blockHash: null,
        sequence: null,
      }
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expectDecryptedNoteValueToMatch(deserializedValue, value)
    })
  })

  describe('with all fields defined', () => {
    it('serializes the object into a buffer and deserializes to the original object', async () => {
      const encoder = new DecryptedNoteValueEncoding()

      const account = await useAccountFixture(nodeTest.wallet)
      const transaction = await useMinersTxFixture(nodeTest.node, account)
      const note = transaction.getNote(0).decryptNoteForOwner(account.incomingViewKey)
      Assert.isNotUndefined(note)

      const value: DecryptedNoteValue = {
        accountId: 'uuid',
        spent: true,
        index: 40,
        nullifier: Buffer.alloc(32, 1),
        note,
        transactionHash: Buffer.alloc(32, 1),
        blockHash: Buffer.alloc(32, 1),
        sequence: 1,
      }
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expectDecryptedNoteValueToMatch(deserializedValue, value)
    })
  })
})
