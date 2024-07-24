/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CurrencyUtils, RpcAsset } from '@ironfish/sdk'
import { Args, Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import { table, TableFlags } from '../../../ui'
import { TableCols } from '../../../utils/table'

const { sort: _, ...tableFlags } = TableFlags
export class NotesCommand extends IronfishCommand {
  static description = `Display the account notes`

  static flags = {
    ...RemoteFlags,
    ...tableFlags,
    account: Flags.string({
      char: 'a',
      description: 'Name of the account to get notes for',
    }),
  }

  static args = {
    account: Args.string({
      required: false,
      description: 'Name of the account to get notes for. DEPRECATED: use --account flag',
    }),
  }

  async start(): Promise<void> {
    const { flags, args } = await this.parse(NotesCommand)
    // TODO: remove account arg
    const account = flags.account ? flags.account : args.account

    const assetLookup: Map<string, RpcAsset> = new Map()

    const client = await this.connectRpc()

    const response = client.wallet.getAccountNotesStream({ account })

    let showHeader = !flags['no-header']

    for await (const note of response.contentStream()) {
      if (!assetLookup.has(note.assetId)) {
        assetLookup.set(
          note.assetId,
          (await client.wallet.getAsset({ id: note.assetId, account })).content,
        )
      }

      table(
        [note],
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
        { ...flags, 'no-header': !showHeader },
      )
      showHeader = false
    }
  }
}
