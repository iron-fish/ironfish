/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { BufferMap, BufferSet } from 'buffer-map'
import { Assert } from '../../../assert'
import { Transaction } from '../../../primitives'
import { useAccountFixture, useBlockWithTx } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { Account } from '../../../wallet'
import { RpcResponseEnded } from '../../response'
import { GetNotesResponse } from './getNotes'
import { serializeRpcWalletNote } from './serializers'
import { RpcWalletNote } from './types'

describe('Route wallet/getNotes', () => {
  const routeTest = createRouteTest(true)
  let account: Account
  let accountNotesByHash: BufferMap<RpcWalletNote>
  let transaction: Transaction

  beforeAll(async () => {
    const node = routeTest.node

    account = await useAccountFixture(node.wallet, 'account')

    const {
      previous,
      block,
      transaction: blockTransaction,
    } = await useBlockWithTx(node, account, account, true)
    await node.chain.addBlock(block)
    await node.wallet.scan()

    transaction = blockTransaction

    const asset = await account.getAsset(Asset.nativeId())

    accountNotesByHash = new BufferMap<RpcWalletNote>()
    for (const transaction of [...previous.transactions, ...block.transactions]) {
      for (const note of transaction.notes) {
        const decryptedNote = await account.getDecryptedNote(note.hash())

        if (!decryptedNote) {
          continue
        }

        accountNotesByHash.set(
          note.hash(),
          serializeRpcWalletNote(decryptedNote, account.publicAddress, asset),
        )
      }
    }
  })

  it('gets notes by account', async () => {
    const response = await routeTest.client.wallet.getNotes({
      account: account.name,
    })

    expect(response.status).toBe(200)

    const { notes: responseNotes, nextPageCursor } = response.content

    expect(responseNotes).toHaveLength(accountNotesByHash.size)
    for (const responseNote of responseNotes) {
      const expectedNote = accountNotesByHash.get(Buffer.from(responseNote.noteHash, 'hex'))

      Assert.isNotUndefined(expectedNote)

      expect(responseNote).toEqual(expectedNote)
    }

    expect(nextPageCursor).toBeNull()
  })

  it('gets notes by account with pagination', async () => {
    const notesCount = accountNotesByHash.size

    const responseNoteHashes = new Set<string>()

    let pageCursor: string | undefined = undefined
    let nextPageCursor: string | null = null
    for (let i = 0; i < notesCount; i++) {
      const response: RpcResponseEnded<GetNotesResponse> =
        await routeTest.client.wallet.getNotes({
          account: account.name,
          pageSize: 1,
          pageCursor,
        })
      const responseNotes = response.content.notes
      nextPageCursor = response.content.nextPageCursor

      expect(response.status).toBe(200)
      expect(responseNotes.length).toBe(1)

      const expectedNote = accountNotesByHash.get(Buffer.from(responseNotes[0].noteHash, 'hex'))
      expect(responseNotes[0]).toEqual(expectedNote)

      pageCursor = nextPageCursor ?? undefined
      responseNoteHashes.add(responseNotes[0].noteHash)
    }

    // ensure that all notes were returned with no duplicates
    expect(responseNoteHashes.size).toEqual(accountNotesByHash.size)

    // last nextPageCursor
    expect(nextPageCursor).toBeNull()
  })

  it('filters notes by value', async () => {
    // notes have values 1, 199999998, and 200000000
    const minValue = '2'
    const maxValue = '1999999999'

    const minResponse: RpcResponseEnded<GetNotesResponse> =
      await routeTest.client.wallet.getNotes({
        account: account.name,
        filter: {
          value: { min: minValue },
        },
      })
    const { notes: minResponseNotes } = minResponse.content

    expect(minResponse.status).toBe(200)
    expect(minResponseNotes.length).toBe(2)

    const maxResponse: RpcResponseEnded<GetNotesResponse> =
      await routeTest.client.wallet.getNotes({
        account: account.name,
        filter: {
          value: { max: maxValue },
        },
      })
    const { notes: maxResponseNotes } = maxResponse.content

    expect(maxResponse.status).toBe(200)
    expect(maxResponseNotes.length).toBe(2)

    const minMaxResponse: RpcResponseEnded<GetNotesResponse> =
      await routeTest.client.wallet.getNotes({
        account: account.name,
        filter: {
          value: { min: minValue, max: maxValue },
        },
      })
    const { notes: minMaxResponseNotes } = minMaxResponse.content

    expect(minMaxResponse.status).toBe(200)
    expect(minMaxResponseNotes.length).toBe(1)
  })

  it('filters notes by assetId', async () => {
    const nativeResponse: RpcResponseEnded<GetNotesResponse> =
      await routeTest.client.wallet.getNotes({
        account: account.name,
        filter: {
          assetId: Asset.nativeId().toString('hex'),
        },
      })

    expect(nativeResponse.status).toBe(200)
    expect(nativeResponse.content.notes.length).toBe(3)

    const response: RpcResponseEnded<GetNotesResponse> = await routeTest.client.wallet.getNotes(
      {
        account: account.name,
        filter: {
          assetId: 'deadbeef',
        },
      },
    )

    expect(response.status).toBe(200)
    expect(response.content.notes).toHaveLength(0)
  })

  it('finds notes by index', async () => {
    for (const [, note] of accountNotesByHash) {
      if (!note.index) {
        continue
      }

      const response: RpcResponseEnded<GetNotesResponse> =
        await routeTest.client.wallet.getNotes({
          account: account.name,
          filter: {
            index: note.index,
          },
        })

      expect(response.status).toBe(200)
      expect(response.content.notes.length).toBe(1)
      expect(response.content.notes[0]).toEqual(note)
    }
  })

  it('finds notes by nullifier', async () => {
    for (const [, note] of accountNotesByHash) {
      if (!note.nullifier) {
        continue
      }

      const response: RpcResponseEnded<GetNotesResponse> =
        await routeTest.client.wallet.getNotes({
          account: account.name,
          filter: {
            nullifier: note.nullifier,
          },
        })

      expect(response.status).toBe(200)
      expect(response.content.notes.length).toBe(1)
      expect(response.content.notes[0]).toEqual(note)
    }
  })

  it('finds notes by noteHash', async () => {
    for (const [, note] of accountNotesByHash) {
      const response: RpcResponseEnded<GetNotesResponse> =
        await routeTest.client.wallet.getNotes({
          account: account.name,
          filter: {
            noteHash: note.noteHash,
          },
        })

      expect(response.status).toBe(200)
      expect(response.content.notes.length).toBe(1)
      expect(response.content.notes[0]).toEqual(note)
    }
  })

  it('filters notes by transactionHash', async () => {
    const response: RpcResponseEnded<GetNotesResponse> = await routeTest.client.wallet.getNotes(
      {
        account: account.name,
        filter: {
          transactionHash: transaction.hash().toString('hex'),
        },
      },
    )

    expect(response.status).toBe(200)
    expect(response.content.notes.length).toBe(2)
    for (const note of response.content.notes) {
      const accountNote: RpcWalletNote | undefined = accountNotesByHash.get(
        Buffer.from(note.noteHash, 'hex'),
      )
      Assert.isNotUndefined(accountNote)

      expect(note.transactionHash).toEqual(accountNote.transactionHash)
    }
  })

  it('filters notes by spent', async () => {
    const filteredNoteHashes = new BufferSet()

    for (const [noteHash, note] of accountNotesByHash) {
      if (!note.spent) {
        filteredNoteHashes.add(noteHash)
      }
    }

    const response: RpcResponseEnded<GetNotesResponse> = await routeTest.client.wallet.getNotes(
      {
        account: account.name,
        filter: {
          spent: false,
        },
      },
    )
    const { notes: responseNotes, nextPageCursor } = response.content

    expect(response.status).toBe(200)
    expect(responseNotes.length).toBe(filteredNoteHashes.size)

    for (const note of responseNotes) {
      expect(note.spent).toBe(false)
    }

    expect(nextPageCursor).toBeNull()
  })
})
