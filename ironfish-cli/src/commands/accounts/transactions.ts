/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CliUx } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class TransactionsCommand extends IronfishCommand {
  static description = `Display the account transactions`

  static flags = {
    ...RemoteFlags,
  }

  static args = [
    {
      name: 'account',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'name of the account to get transactions for',
    },
  ]

  async start(): Promise<void> {
    const { args } = await this.parse(TransactionsCommand)
    const account = args.account as string | undefined

    const client = await this.sdk.connectRpc()

    const response = await client.getTransactionNotes({
      account,
    })

    const { account: accountResponse, notes } = response.content

    this.log(`\n ${String(accountResponse)} - Transaction notes\n`)

    CliUx.ux.table(notes, {
      isSpender: {
        header: 'Spender',
        get: (row) => (row.isSpender ? `✔` : `x`),
      },
      isMinerFee: {
        header: 'Miner Fee',
        get: (row) => (row.isMinerFee ? `✔` : `x`),
      },
      amount: {
        header: 'Amount ($ORE)',
      },
      txFee: {
        header: 'Tx Fee ($ORE)',
      },
      txHash: {
        header: 'Tx Hash',
      },
      memo: {
        header: 'Memo',
      },
    })

    this.log(`\n`)
  }
}
