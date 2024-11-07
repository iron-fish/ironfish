/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CurrencyUtils, RpcAsset, RpcWalletNote } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import * as ui from '../../../ui'
import { useAccount } from '../../../utils'
import { TableCols } from '../../../utils/table'

const { sort: _, ...tableFlags } = ui.TableFlags
export class NotesCommand extends IronfishCommand {
  static description = `list the account's notes`

  static flags = {
    ...RemoteFlags,
    ...tableFlags,
    account: Flags.string({
      char: 'a',
      description: 'Name of the account to get notes for',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(NotesCommand)

    const assetLookup: Map<string, RpcAsset> = new Map()

    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    const account = await useAccount(client, flags.account)

    const response = client.wallet.getAccountNotesStream({ account })
    const notes: RpcWalletNote[] = []
    for await (const note of response.contentStream()) {
      if (notes.length >= flags.limit) {
        break
      }
      if (!assetLookup.has(note.assetId)) {
        assetLookup.set(
          note.assetId,
          (await client.wallet.getAsset({ id: note.assetId, account })).content,
        )
      }
      notes.push(note)
    }
    ui.table(
      notes,
      {
        memo: {
          header: 'Memo',
          // Maximum memo length is 32 bytes
          minWidth: 33,
          get: (row) => row.memo,
        },
        sender: {
          header: 'Sender',
          get: (row) => row.sender,
        },
        transactionHash: {
          header: 'From Transaction',
          get: (row) => row.transactionHash,
        },
        isSpent: {
          header: 'Spent',
          get: (row) => {
            if (row.spent === undefined) {
              return '-'
            } else {
              return row.spent ? `✔` : `x`
            }
          },
        },
        ...TableCols.asset({ extended: flags.extended }),
        value: {
          header: 'Amount',
          get: (row) =>
            CurrencyUtils.render(
              row.value,
              false,
              row.assetId,
              assetLookup.get(row.assetId)?.verification,
            ),
          minWidth: 16,
        },
        noteHash: {
          header: 'Note Hash',
          get: (row) => row.noteHash,
        },
        nullifier: {
          header: 'Nullifier',
          get: (row) => {
            if (row.nullifier === null) {
              return '-'
            } else {
              return row.nullifier
            }
          },
        },
      },
      flags,
    )
  }
}
