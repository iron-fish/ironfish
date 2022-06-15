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
      description: 'name of the account to get notes for',
    },
  ]

  async start(): Promise<void> {
    const { args } = await this.parse(NotesCommand)
    const account = args.account as string | undefined

    const client = await this.sdk.connectRpc()

    const response = await client.getAccountNotes({ account })

    const { account: accountResponse, notes } = response.content

    this.log(`\n ${accountResponse} - Account notes\n`)

    CliUx.ux.table(notes, {
      isSpender: {
        header: 'Spender',
        get: (row) => (row.spender ? `✔` : `x`),
      },
      amount: {
        header: 'Amount ($IRON)',
        get: (row) => oreToIron(row.amount),
      },
      memo: {
        header: 'Memo',
      },
      noteTxHash: {
        header: 'From Transaction',
      },
    })

    this.log(`\n`)
  }
}
