/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DECRYPTED_NOTE_LENGTH, ENCRYPTED_NOTE_LENGTH } from '@ironfish/rust-nodejs'
import { createNodeTest, useAccountFixture, useMinersTxFixture } from '../../testUtilities'
import { ACCOUNT_KEY_LENGTH } from '../../wallet'
import { DecryptNotesRequest, DecryptNotesResponse, DecryptNotesTask } from './decryptNotes'

describe('DecryptNotesRequest', () => {
  it('serializes the object to a buffer and deserializes to the original object', () => {
    const request = new DecryptNotesRequest(
      [
        {
          serializedNote: Buffer.alloc(ENCRYPTED_NOTE_LENGTH, 1),
          incomingViewKey: Buffer.alloc(ACCOUNT_KEY_LENGTH, 1).toString('hex'),
          outgoingViewKey: Buffer.alloc(ACCOUNT_KEY_LENGTH, 1).toString('hex'),
          spendingKey: Buffer.alloc(ACCOUNT_KEY_LENGTH, 1).toString('hex'),
          currentNoteIndex: 2,
        },
      ],
      0,
    )
    const buffer = request.serialize()
    const deserializedRequest = DecryptNotesRequest.deserialize(request.jobId, buffer)
    expect(deserializedRequest).toEqual(request)
  })
})

describe('DecryptNotesResponse', () => {
  it('serializes the object to a buffer and deserializes to the original object', () => {
    const response = new DecryptNotesResponse(
      [
        {
          forSpender: false,
          index: 1,
          hash: Buffer.alloc(32, 1),
          nullifier: Buffer.alloc(32, 1),
          serializedNote: Buffer.alloc(DECRYPTED_NOTE_LENGTH, 1),
        },
        null,
      ],
      0,
    )
    const buffer = response.serialize()
    const deserializedResponse = DecryptNotesResponse.deserialize(response.jobId, buffer)
    expect(deserializedResponse).toEqual(response)
  })
})

describe('DecryptNotesTask', () => {
  const nodeTest = createNodeTest()

  describe('execute', () => {
    it('posts the miners fee transaction', async () => {
      const account = await useAccountFixture(nodeTest.wallet)
      const transaction = await useMinersTxFixture(nodeTest.wallet, account)

      const task = new DecryptNotesTask()
      const index = 2
      const request = new DecryptNotesRequest([
        {
          serializedNote: transaction.getNote(0).serialize(),
          incomingViewKey: account.incomingViewKey,
          outgoingViewKey: account.outgoingViewKey,
          spendingKey: account.spendingKey,
          currentNoteIndex: 2,
        },
      ])
      const response = task.execute(request)

      expect(response).toMatchObject({
        notes: [
          {
            forSpender: false,
            index,
            nullifier: expect.any(Buffer),
            hash: expect.any(Buffer),
            serializedNote: expect.any(Buffer),
          },
        ],
      })
    })
  })
})
