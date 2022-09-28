/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CurrencyUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class TransactionsCommand extends IronfishCommand {
  static description = `Display the account transactions`

  static flags = {
    ...RemoteFlags,
    ...CliUx.ux.table.flags(),
    hash: Flags.string({
      char: 't',
      description: 'Transaction hash to get details for',
    }),
  }

  static args = [
    {
      name: 'account',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'Name of the account',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(TransactionsCommand)
    const account = args.account as string | undefined
    await this.getTransactions(account, flags)
  }

  async getTransactions(
    account: string | undefined,
    flags: {
      columns: string | undefined
      'no-truncate': boolean | undefined
      output: string | undefined
      filter: string | undefined
      'no-header': boolean | undefined
      sort: string | undefined
      extended: boolean | undefined
      hash: string | undefined
      csv: boolean | undefined
    },
  ): Promise<void> {
    const client = await this.sdk.connectRpc()
    const response = client.getAccountTransactionsStream({ account })

    let showHeader = true
    for await (const { account, transaction } of response.contentStream()) {
      if (showHeader) {
        this.log(`\n${account} - Account transactions\n`)
      }

      CliUx.ux.table(
        [transaction],
        {
          status: {
            header: 'Status',
          },
          creator: {
            header: 'Creator',
            get: (transaction) => (transaction.creator ? `✔` : `x`),
          },
          hash: {
            header: 'Hash',
          },
          isMinersFee: {
            header: 'Miner Fee',
            get: (transaction) => (transaction.isMinersFee ? `✔` : `x`),
          },
          fee: {
            header: 'Fee ($ORE)',
            get: (transaction) => CurrencyUtils.renderOre(transaction.fee, true),
            minWidth: 20,
          },
          notesCount: {
            header: 'Notes',
            minWidth: 5,
          },
          spendsCount: {
            header: 'Spends',
            minWidth: 5,
          },
          expirationSequence: {
            header: 'Expiration Sequence',
          },
        },
        {
          printLine: this.log.bind(this),
          ...flags,
          'no-header': !showHeader,
        },
      )

      showHeader = false
    }
  }
}
