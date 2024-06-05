/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CurrencyUtils, RpcAsset } from '@ironfish/sdk'
import { Flags, ux } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import { TableCols, TableFlags } from '../../../utils/table'

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

  static args = [
    {
      name: 'account',
      required: false,
      description: 'Name of the account to get notes for. DEPRECATED: use --account flag',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(NotesCommand)
    // TODO: remove account arg
    const account = flags.account ? flags.account : (args.account as string | undefined)

    const assetLookup: Map<string, RpcAsset> = new Map()

    const client = await this.sdk.connectRpc()

    const response = client.wallet.getAccountNotesStream({ account })

    let showHeader = !flags['no-header']

    for await (const note of response.contentStream()) {
      if (!assetLookup.has(note.assetId)) {
        assetLookup.set(
          note.assetId,
          (await client.wallet.getAsset({ id: note.assetId, account })).content,
        )
      }

      ux.table(
        [note],
        {
          memo: {
            header: 'Memo',
            // Maximum memo length is 32 bytes
            minWidth: 33,
          },
          sender: {
            header: 'Sender',
          },
          transactionHash: {
            header: 'From Transaction',
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
