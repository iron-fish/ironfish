/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CurrencyUtils, GetBalanceResponse } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class BalanceCommand extends IronfishCommand {
  static description =
    'Display the account balance\n\
  What is the difference between available to spend balance, and balance?\n\
  Available to spend balance is your coins from transactions that have been mined on blocks on your main chain.\n\
  Balance is your coins from all of your transactions, even if they are on forks or not yet included as part of a mined block.'

  static flags = {
    ...RemoteFlags,
    explain: Flags.boolean({
      default: false,
      description: 'Explain your balance',
    }),
    all: Flags.boolean({
      default: false,
      description: 'Also show unconfirmed balance',
    }),
    confirmations: Flags.integer({
      required: false,
      description: 'Minimum number of blocks confirmations for a note',
    }),
    assetId: Flags.string({
      required: false,
      description: 'Asset identifier to check the balance for',
    }),
  }

  static args = [
    {
      name: 'account',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'Name of the account to get balance for',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(BalanceCommand)
    const account = args.account as string | undefined

    const client = await this.sdk.connectRpc()

    const response = await client.getAccountBalance({
      account,
      assetId: flags.assetId,
      minimumBlockConfirmations: flags.confirmations,
    })
    const assetId = response.content.assetId

    if (flags.explain) {
      this.explainBalance(response.content, assetId)
      return
    }

    if (flags.all) {
      this.log(`Account: ${response.content.account}`)
      this.log(
        `Balance:     ${CurrencyUtils.renderIron(response.content.confirmed, true, assetId)}`,
      )
      this.log(
        `Unconfirmed: ${CurrencyUtils.renderIron(response.content.unconfirmed, true, assetId)}`,
      )
      return
    }

    this.log(`Account: ${response.content.account}`)
    this.log(`Balance: ${CurrencyUtils.renderIron(response.content.confirmed, true, assetId)}`)
  }

  explainBalance(response: GetBalanceResponse, assetId: string): void {
    const unconfirmed = CurrencyUtils.decode(response.unconfirmed)
    const confirmed = CurrencyUtils.decode(response.confirmed)

    const unconfirmedDelta = unconfirmed - confirmed

    this.log(`Account: ${response.account}`)
    this.log('')

    this.log(`Your balance is made of notes on the chain that are safe to spend`)
    this.log(`Balance: ${CurrencyUtils.renderIron(confirmed, true, assetId)}`)
    this.log('')

    this.log(
      `${response.unconfirmedCount} notes worth ${CurrencyUtils.renderIron(
        unconfirmedDelta,
      )} are on the chain within ${response.minimumBlockConfirmations.toString()} blocks of the head`,
    )
    this.log(`Unconfirmed: ${CurrencyUtils.renderIron(unconfirmed, true, assetId)}`)
  }
}
