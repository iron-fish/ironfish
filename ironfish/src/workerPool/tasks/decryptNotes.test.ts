/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DECRYPTED_NOTE_LENGTH, ENCRYPTED_NOTE_LENGTH } from '@ironfish/rust-nodejs'
import {
  createNodeTest,
  serializePayloadToBuffer,
  useAccountFixture,
  useMinerBlockFixture,
  useMinersTxFixture,
  useTxFixture,
} from '../../testUtilities'
import { ACCOUNT_KEY_LENGTH } from '../../wallet'
import { VIEW_KEY_LENGTH } from '../../wallet/walletdb/accountValue'
import { DecryptNotesRequest, DecryptNotesResponse, DecryptNotesTask } from './decryptNotes'

describe('DecryptNotesRequest', () => {
  it('serializes the object to a buffer and deserializes to the original object', () => {
    const request = new DecryptNotesRequest(
      [
        {
          serializedNote: Buffer.alloc(ENCRYPTED_NOTE_LENGTH, 1),
          incomingViewKey: Buffer.alloc(ACCOUNT_KEY_LENGTH, 1).toString('hex'),
          outgoingViewKey: Buffer.alloc(ACCOUNT_KEY_LENGTH, 1).toString('hex'),
          viewKey: Buffer.alloc(VIEW_KEY_LENGTH, 1).toString('hex'),
          currentNoteIndex: 2,
          decryptForSpender: true,
        },
      ],
      0,
    )
    const buffer = serializePayloadToBuffer(request)
    const deserializedRequest = DecryptNotesRequest.deserializePayload(request.jobId, buffer)
    expect(deserializedRequest).toEqual(request)
  })

  it('serializes over 255 notes', () => {
    const length = 600

    const request = new DecryptNotesRequest(
      Array.from({ length }, () => ({
        serializedNote: Buffer.alloc(ENCRYPTED_NOTE_LENGTH, 1),
        incomingViewKey: Buffer.alloc(ACCOUNT_KEY_LENGTH, 1).toString('hex'),
        outgoingViewKey: Buffer.alloc(ACCOUNT_KEY_LENGTH, 1).toString('hex'),
        viewKey: Buffer.alloc(VIEW_KEY_LENGTH, 1).toString('hex'),
        currentNoteIndex: 2,
        decryptForSpender: true,
      })),
      0,
    )
    const buffer = serializePayloadToBuffer(request)
    const deserializedRequest = DecryptNotesRequest.deserializePayload(request.jobId, buffer)
    expect(deserializedRequest.payloads).toHaveLength(length)
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
    const buffer = serializePayloadToBuffer(response)
    const deserializedResponse = DecryptNotesResponse.deserializePayload(response.jobId, buffer)
    expect(deserializedResponse).toEqual(response)
  })

  it('serializes over 255 notes', () => {
    const length = 600

    const request = new DecryptNotesResponse(
      Array.from({ length }, () => ({
        forSpender: false,
        index: 1,
        hash: Buffer.alloc(32, 1),
        nullifier: Buffer.alloc(32, 1),
        serializedNote: Buffer.alloc(DECRYPTED_NOTE_LENGTH, 1),
      })),
      0,
    )
    const buffer = serializePayloadToBuffer(request)
    const deserializedResponse = DecryptNotesResponse.deserializePayload(request.jobId, buffer)
    expect(deserializedResponse.notes).toHaveLength(length)
  })
})

describe('DecryptNotesTask', () => {
  const nodeTest = createNodeTest()

  describe('execute', () => {
    it('posts the miners fee transaction', async () => {
      const account = await useAccountFixture(nodeTest.wallet)
      const transaction = await useMinersTxFixture(nodeTest.node, account)

      const task = new DecryptNotesTask()
      const index = 2
      const request = new DecryptNotesRequest([
        {
          serializedNote: transaction.getNote(0).serialize(),
          incomingViewKey: account.incomingViewKey,
          outgoingViewKey: account.outgoingViewKey,
          viewKey: account.viewKey,
          currentNoteIndex: 2,
          decryptForSpender: true,
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

    it('optionally decryptes notes for spender', async () => {
      const accountA = await useAccountFixture(nodeTest.wallet, 'accountA')
      const accountB = await useAccountFixture(nodeTest.wallet, 'accountB')

      const block2 = await useMinerBlockFixture(nodeTest.chain, 2, accountA)
      await expect(nodeTest.chain).toAddBlock(block2)
      await nodeTest.wallet.scan()

      const transaction = await useTxFixture(nodeTest.wallet, accountA, accountB)

      const task = new DecryptNotesTask()
      const index = 3
      const requestSpender = new DecryptNotesRequest([
        {
          serializedNote: transaction.getNote(0).serialize(),
          incomingViewKey: accountA.incomingViewKey,
          outgoingViewKey: accountA.outgoingViewKey,
          viewKey: accountA.viewKey,
          currentNoteIndex: 3,
          decryptForSpender: true,
        },
      ])
      const responseSpender = task.execute(requestSpender)

      expect(responseSpender).toMatchObject({
        notes: [
          {
            forSpender: true,
            index,
            nullifier: null,
            hash: expect.any(Buffer),
            serializedNote: expect.any(Buffer),
          },
        ],
      })

      const requestNoSpender = new DecryptNotesRequest([
        {
          serializedNote: transaction.getNote(0).serialize(),
          incomingViewKey: accountA.incomingViewKey,
          outgoingViewKey: accountA.outgoingViewKey,
          viewKey: accountA.viewKey,
          currentNoteIndex: 3,
          decryptForSpender: false,
        },
      ])
      const responseNoSpender = task.execute(requestNoSpender)

      expect(responseNoSpender).toMatchObject({ notes: [null] })
    })
  })
})
