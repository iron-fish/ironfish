/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { BufferMap } from 'buffer-map'
import { Assert } from '../../../assert'
import { useAccountFixture, useBlockWithTx } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { Account } from '../../../wallet'
import { RpcResponseEnded } from '../../response'
import { GetNotesResponse } from './getNotes'
import { RpcWalletNote } from './types'
import { serializeRpcWalletNote } from './utils'

describe('Route wallet/getNotes', () => {
  const routeTest = createRouteTest(true)
  let account: Account
  let accountNotesByHash: BufferMap<RpcWalletNote>

  beforeAll(async () => {
    const node = routeTest.node

    account = await useAccountFixture(node.wallet, 'account')

    const { previous, block } = await useBlockWithTx(node, account, account, true)
    await node.chain.addBlock(block)
    await node.wallet.updateHead()

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

    const { notes: responseNotes, nextPageToken } = response.content

    expect(responseNotes).toHaveLength(accountNotesByHash.size)
    for (const responseNote of responseNotes) {
      const expectedNote = accountNotesByHash.get(Buffer.from(responseNote.noteHash, 'hex'))

      Assert.isNotUndefined(expectedNote)

      expect(responseNote).toEqual(expectedNote)
    }

    expect(nextPageToken).toBeNull()
  })

  it('gets notes by account with pagination', async () => {
    const notesCount = accountNotesByHash.size

    const responseNoteHashes = new Set<string>()

    let pageToken: string | undefined = undefined
    for (let i = 0; i < notesCount; i++) {
      const response: RpcResponseEnded<GetNotesResponse> =
        await routeTest.client.wallet.getNotes({
          account: account.name,
          pageSize: 1,
          pageToken,
        })
      const { notes: responseNotes, nextPageToken } = response.content

      expect(response.status).toBe(200)
      expect(responseNotes.length).toBe(1)

      const expectedNote = accountNotesByHash.get(Buffer.from(responseNotes[0].noteHash, 'hex'))
      expect(responseNotes[0]).toEqual(expectedNote)

      pageToken = nextPageToken ?? undefined
      responseNoteHashes.add(responseNotes[0].noteHash)
    }

    // ensure that all notes were returned with no duplicates
    expect(responseNoteHashes.size).toEqual(accountNotesByHash.size)
  })
})
