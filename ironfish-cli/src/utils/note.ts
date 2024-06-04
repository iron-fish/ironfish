/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert, RpcClient } from '@ironfish/sdk'

export async function fetchNotes(
  client: RpcClient,
  account: string,
  assetId: string,
  notesToCombine: number,
) {
  const noteSize = await getNoteTreeSize(client)

  const getNotesResponse = await client.wallet.getNotes({
    account,
    pageSize: notesToCombine,
    filter: {
      assetId,
      spent: false,
    },
  })

  // filtering notes by noteSize and sorting them by value in ascending order
  const notes = getNotesResponse.content.notes
    .filter((note) => {
      if (!note.index) {
        return false
      }
      return note.index < noteSize
    })
    .sort((a, b) => {
      if (a.value < b.value) {
        return -1
      }
      return 1
    })

  return notes
}

async function getNoteTreeSize(client: RpcClient) {
  const getCurrentBlock = await client.chain.getChainInfo()

  const currentBlockSequence = parseInt(getCurrentBlock.content.currentBlockIdentifier.index)

  const getBlockResponse = await client.chain.getBlock({
    sequence: currentBlockSequence,
  })

  Assert.isNotNull(getBlockResponse.content.block.noteSize)

  const config = await client.config.getConfig()

  // Adding a buffer to avoid a mismatch between confirmations used to load notes and confirmations used when creating witnesses to spend them
  return getBlockResponse.content.block.noteSize - (config.content.confirmations || 2)
}
