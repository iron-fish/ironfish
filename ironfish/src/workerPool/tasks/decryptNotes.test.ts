/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DECRYPTED_NOTE_LENGTH, ENCRYPTED_NOTE_LENGTH } from '@ironfish/rust-nodejs'
import { Assert } from '../../assert'
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
import {
  DecryptedNote,
  DecryptNotesRequest,
  DecryptNotesResponse,
  DecryptNotesSharedAccountKeys,
  DecryptNotesTask,
} from './decryptNotes'

describe('DecryptNotesRequest', () => {
  it('serializes the object to a buffer and deserializes to the original object', () => {
    const request = new DecryptNotesRequest(
      [
        {
          incomingViewKey: Buffer.alloc(ACCOUNT_KEY_LENGTH, 1),
          outgoingViewKey: Buffer.alloc(ACCOUNT_KEY_LENGTH, 1),
          viewKey: Buffer.alloc(VIEW_KEY_LENGTH, 1),
        },
      ],
      [
        {
          serializedNote: Buffer.alloc(ENCRYPTED_NOTE_LENGTH, 1),
          currentNoteIndex: 2,
        },
      ],
      {
        decryptForSpender: true,
        skipNoteValidation: false,
      },
      0,
    )
    const buffer = serializePayloadToBuffer(request)
    const deserializedRequest = DecryptNotesRequest.deserializePayload(
      request.jobId,
      buffer,
      null,
    )
    expect(deserializedRequest).toEqual(request)
  })

  it('serializes the object to a buffer and deserializes to the original object with shared memory keys', () => {
    const sharedKeys = new DecryptNotesSharedAccountKeys([
      {
        incomingViewKey: Buffer.alloc(ACCOUNT_KEY_LENGTH, 1),
        outgoingViewKey: Buffer.alloc(ACCOUNT_KEY_LENGTH, 1),
        viewKey: Buffer.alloc(VIEW_KEY_LENGTH, 1),
      },
    ])
    const request = new DecryptNotesRequest(
      sharedKeys,
      [
        {
          serializedNote: Buffer.alloc(ENCRYPTED_NOTE_LENGTH, 1),
          currentNoteIndex: 2,
        },
      ],
      {
        decryptForSpender: true,
        skipNoteValidation: false,
      },
      0,
    )
    const buffer = serializePayloadToBuffer(request)
    const sharedMemory = request.getSharedMemoryPayload()
    const deserializedRequest = DecryptNotesRequest.deserializePayload(
      request.jobId,
      buffer,
      sharedMemory,
    )
    expect(deserializedRequest).toEqual(request)
  })

  it('serializes over 255 notes', () => {
    const numNotes = 600
    const numAccounts = 200

    const request = new DecryptNotesRequest(
      Array.from({ length: numAccounts }, () => ({
        incomingViewKey: Buffer.alloc(ACCOUNT_KEY_LENGTH, 1),
        outgoingViewKey: Buffer.alloc(ACCOUNT_KEY_LENGTH, 1),
        viewKey: Buffer.alloc(VIEW_KEY_LENGTH, 1),
      })),
      Array.from({ length: numNotes }, () => ({
        serializedNote: Buffer.alloc(ENCRYPTED_NOTE_LENGTH, 1),
        currentNoteIndex: 2,
      })),
      { decryptForSpender: true },
      0,
    )
    const buffer = serializePayloadToBuffer(request)
    const deserializedRequest = DecryptNotesRequest.deserializePayload(
      request.jobId,
      buffer,
      null,
    )
    expect(deserializedRequest.encryptedNotes).toHaveLength(numNotes)
    expect(deserializedRequest.accountKeys).toHaveLength(numAccounts)
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
        undefined,
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

  it('uses sparses arrays to minimize memory usage', () => {
    const notes = []
    const notesLength = 10000
    const testNote = {
      forSpender: false,
      index: 1,
      hash: Buffer.alloc(32, 1),
      nullifier: Buffer.alloc(32, 1),
      serializedNote: Buffer.alloc(DECRYPTED_NOTE_LENGTH, 1),
    }
    notes[1000] = testNote
    notes[2000] = testNote
    notes[3000] = testNote
    notes.length = notesLength
    expect(notes).toHaveLength(notesLength)

    const response = new DecryptNotesResponse(notes, 0)
    const buffer = serializePayloadToBuffer(response)
    const deserializedResponse = DecryptNotesResponse.deserializePayload(response.jobId, buffer)

    expect(deserializedResponse.notes).toHaveLength(notesLength)
    expect(deserializedResponse.notes).toEqual(notes)

    const explicitlySetNotes = new Array<DecryptedNote>()
    deserializedResponse.notes.forEach((note) => {
      Assert.isNotUndefined(note)
      explicitlySetNotes.push(note)
    })
    expect(explicitlySetNotes).toHaveLength(3)
    expect(explicitlySetNotes).toEqual([testNote, testNote, testNote])
  })

  describe('mapToAccounts', () => {
    it('returns a map linking each account to its notes', () => {
      const accounts = 'abcdefghijklmnopqrstuvwxyz'
        .split('')
        .map((letter) => ({ accountId: letter }))
      const notesPerAccount = 100
      const length = accounts.length * notesPerAccount

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

      const accountsToNotes = request.mapToAccounts(accounts)
      expect(accountsToNotes.size).toBe(accounts.length)

      const returnedAccounts = Array.from(accountsToNotes.keys())
        .sort()
        .map((accountId) => ({ accountId }))
      expect(returnedAccounts).toEqual(accounts)

      for (const notes of accountsToNotes.values()) {
        expect(notes.length).toBe(notesPerAccount)
      }
    })
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
      const request = new DecryptNotesRequest(
        [
          {
            incomingViewKey: Buffer.from(account.incomingViewKey, 'hex'),
            outgoingViewKey: Buffer.from(account.outgoingViewKey, 'hex'),
            viewKey: Buffer.from(account.viewKey, 'hex'),
          },
        ],
        [
          {
            serializedNote: transaction.getNote(0).serialize(),
            currentNoteIndex: 2,
          },
        ],
        { decryptForSpender: true },
      )
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
      const requestSpender = new DecryptNotesRequest(
        [
          {
            incomingViewKey: Buffer.from(accountA.incomingViewKey, 'hex'),
            outgoingViewKey: Buffer.from(accountA.outgoingViewKey, 'hex'),
            viewKey: Buffer.from(accountA.viewKey, 'hex'),
          },
        ],
        [
          {
            serializedNote: transaction.getNote(0).serialize(),
            currentNoteIndex: 3,
          },
        ],
        { decryptForSpender: true },
      )
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

      const requestNoSpender = new DecryptNotesRequest(
        [
          {
            incomingViewKey: Buffer.from(accountA.incomingViewKey, 'hex'),
            outgoingViewKey: Buffer.from(accountA.outgoingViewKey, 'hex'),
            viewKey: Buffer.from(accountA.viewKey, 'hex'),
          },
        ],
        [
          {
            serializedNote: transaction.getNote(0).serialize(),
            currentNoteIndex: 3,
          },
        ],
        { decryptForSpender: false },
      )
      const responseNoSpender = task.execute(requestNoSpender)

      expect(responseNoSpender).toMatchObject({ notes: [undefined] })
    })
  })
})
