/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../assert'
import { createNodeTest, useAccountFixture, useMinersTxFixture } from '../../testUtilities'
import {
  GetUnspentNotesRequest,
  GetUnspentNotesResponse,
  GetUnspentNotesTask,
} from './getUnspentNotes'

describe('GetUnspentNotesRequest', () => {
  it('serializes the object to a buffer and deserializes to the original object', () => {
    const mockTransactionPosted = Buffer.from('')
    const accountIncomingViewKeys = ['foo', 'bar', 'baz']
    const request = new GetUnspentNotesRequest(mockTransactionPosted, accountIncomingViewKeys)
    const buffer = request.serialize()
    const deserializedRequest = GetUnspentNotesRequest.deserialize(request.jobId, buffer)
    expect(deserializedRequest).toEqual(request)
  })
})

describe('GetUnspentNotesResponse', () => {
  it('serializes the object to a buffer and deserializes to the original object', () => {
    const notes = [
      {
        account: 'foo👁️🏃🐟',
        hash: 'bar',
        note: Buffer.from('baz'),
      },
      {
        account: '1',
        hash: '2',
        note: Buffer.from('3'),
      },
    ]
    const response = new GetUnspentNotesResponse(notes, 0)
    const deserializedResponse = GetUnspentNotesResponse.deserialize(
      response.jobId,
      response.serialize(),
    )
    expect(deserializedResponse).toEqual(response)
  })
})

describe('GetUnspentNotesTask', () => {
  const nodeTest = createNodeTest()

  describe('execute', () => {
    it('gets unspent notes for an account', async () => {
      const account = await useAccountFixture(nodeTest.accounts)
      const transaction = await useMinersTxFixture(nodeTest.accounts, account)

      const request = new GetUnspentNotesRequest(transaction.serialize(), [
        account.incomingViewKey,
      ])
      const task = new GetUnspentNotesTask()
      const response = task.execute(request)

      const note = transaction.getNote(0).decryptNoteForOwner(account.incomingViewKey)
      Assert.isNotUndefined(note)
      expect(note.serialize()).toEqual(response.notes[0].note)
    })
  })
})
