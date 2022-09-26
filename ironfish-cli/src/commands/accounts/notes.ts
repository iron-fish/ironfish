/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { oreToIron } from '@ironfish/sdk'
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
    let first_response = true

    for await (const { account: accountResponse, notes } of response.contentStream()) {
      const no_header = first_response ? false : true
      if (first_response) {
        this.log(`\n ${accountResponse} - Account notes\n`)
        first_response = false
      }
      CliUx.ux.table(
        notes,
        {
          isOwner: {
            header: 'Owner',
            get: (row) => (row.owner ? `✔` : `x`),
          },
          amount: {
            header: 'Amount ($IRON)',
            get: (row) => oreToIron(row.amount),
          },
          memo: {
            header: 'Memo',
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
        { 'no-header': no_header },
      )
    }
    this.log(`\n`)
  }
}
