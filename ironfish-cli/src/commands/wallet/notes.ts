/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CurrencyUtils } from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { TableCols } from '../../utils/table'

const { sort: _, ...tableFlags } = CliUx.ux.table.flags()
export class NotesCommand extends IronfishCommand {
  static description = `Display the account notes`

  static flags = {
    ...RemoteFlags,
    ...tableFlags,
  }

  static args = [
    {
      name: 'account',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'Name of the account to get notes for',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(NotesCommand)
    const account = args.account as string | undefined

    const client = await this.sdk.connectWalletRpc()

    const response = client.wallet.getAccountNotesStream({ account })

    let showHeader = !flags['no-header']

    for await (const note of response.contentStream()) {
      CliUx.ux.table(
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
          noteHash: {
            header: 'Note Hash',
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
                return row.spent ? `✔` : ``
              }
            },
          },
          ...TableCols.asset({ extended: flags.extended }),
          value: {
            header: 'Amount',
            get: (row) => CurrencyUtils.renderIron(row.value),
            minWidth: 16,
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
