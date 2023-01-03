/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CurrencyUtils } from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class NotesCommand extends IronfishCommand {
  static description = `Display the account notes`

  static flags = {
    ...RemoteFlags,
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
    const { args } = await this.parse(NotesCommand)
    const account = args.account as string | undefined

    const client = await this.sdk.connectRpc()

    const response = client.getAccountNotesStream({ account })

    let showHeader = true

    for await (const note of response.contentStream()) {
      CliUx.ux.table(
        [note],
        {
          value: {
            header: 'Amount',
            get: (row) => CurrencyUtils.renderIron(row.value),
          },
          assetName: {
            header: 'Asset Name',
          },
          assetIdentifier: {
            header: 'Asset Id',
          },
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
        },
        { 'no-header': !showHeader },
      )
      showHeader = false
    }
  }
}
