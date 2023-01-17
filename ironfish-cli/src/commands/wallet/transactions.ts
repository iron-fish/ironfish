/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CurrencyUtils, TimeUtils } from '@ironfish/sdk'
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
    limit: Flags.integer({
      description: 'Number of latest transactions to get details for',
    }),
    confirmations: Flags.integer({
      description: 'Number of block confirmations needed to confirm a transaction',
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

    const client = await this.sdk.connectRpc()
    const response = client.getAccountTransactionsStream({
      account,
      hash: flags.hash,
      limit: flags.limit,
      confirmations: flags.confirmations,
    })

    let showHeader = true

    for await (const transaction of response.contentStream()) {
      CliUx.ux.table(
        [transaction],
        {
          timestamp: {
            header: 'Timestamp',
            get: (transaction) => TimeUtils.renderDate(transaction.timestamp),
          },
          status: {
            header: 'Status',
            minWidth: 12,
          },
          creator: {
            header: 'Creator',
            get: (transaction) => (transaction.creator ? `✔` : ``),
          },
          hash: {
            header: 'Hash',
          },
          isMinersFee: {
            header: 'Miner Fee',
            get: (transaction) => (transaction.isMinersFee ? `✔` : ``),
          },
          fee: {
            header: 'Fee ($IRON)',
            get: (transaction) => CurrencyUtils.renderIron(transaction.fee),
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
          mintsCount: {
            header: 'Mints',
            minWidth: 5,
          },
          burnsCount: {
            header: 'Burns',
            minWidth: 5,
          },
          expiration: {
            header: 'Expiration',
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
