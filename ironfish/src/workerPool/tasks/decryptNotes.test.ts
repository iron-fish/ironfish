/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ENCRYPTED_NOTE_LENGTH, KEY_LENGTH, NOTE_LENGTH } from '../../common/constants'
import { createNodeTest, useAccountFixture, useMinersTxFixture } from '../../testUtilities'
import { DecryptNotesRequest, DecryptNotesResponse, DecryptNotesTask } from './decryptNotes'

describe('DecryptNotesRequest', () => {
  it('serializes the object to a buffer and deserializes to the original object', () => {
    const request = new DecryptNotesRequest(
      Buffer.alloc(ENCRYPTED_NOTE_LENGTH, 1),
      Buffer.alloc(KEY_LENGTH, 1).toString('hex'),
      Buffer.alloc(KEY_LENGTH, 1).toString('hex'),
      Buffer.alloc(KEY_LENGTH, 1).toString('hex'),
      2,
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
      {
        forSpender: false,
        index: 1,
        merkleHash: Buffer.alloc(32, 1),
        nullifier: Buffer.alloc(32, 1),
        serializedNote: Buffer.alloc(NOTE_LENGTH, 1),
      },
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
      const account = await useAccountFixture(nodeTest.accounts)
      const transaction = await useMinersTxFixture(nodeTest.accounts, account)

      const task = new DecryptNotesTask()
      const index = 2
      const request = new DecryptNotesRequest(
        transaction.getNote(0).serialize(),
        account.incomingViewKey,
        account.outgoingViewKey,
        account.spendingKey,
        2,
      )
      const response = task.execute(request)

      expect(response).toMatchObject({
        note: {
          forSpender: false,
          index,
          nullifier: expect.any(Buffer),
          merkleHash: expect.any(Buffer),
          serializedNote: expect.any(Buffer),
        },
      })
    })
  })
})
