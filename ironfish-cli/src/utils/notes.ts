/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { Assert, RpcClient, RpcWalletNote } from '@ironfish/sdk'

export async function getNoteTreeSize(client: RpcClient): Promise<number> {
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

export async function fetchSortedNotes(
  client: RpcClient,
  account: string,
  pageSize: number,
): Promise<RpcWalletNote[]> {
  const noteSize = await getNoteTreeSize(client)

  pageSize = Math.max(pageSize, 10) // adds a buffer in case the user selects a small number of notes and they get filtered out by noteSize

  const getNotesResponse = await client.wallet.getNotes({
    account,
    pageSize: pageSize,
    filter: {
      assetId: Asset.nativeId().toString('hex'),
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
