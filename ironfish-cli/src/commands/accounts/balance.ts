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
      description: 'Also show pending and unconfirmed balance',
    }),
    confirmations: Flags.integer({
      required: false,
      description: 'Minimum number of blocks confirmations for a note',
    }),
    ore: Flags.boolean({
      default: false,
      description: 'Show amounts in ore',
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
      minimumBlockConfirmations: flags.confirmations,
    })

    if (flags.explain) {
      this.explainBalance(response.content, flags.ore)
      return
    }

    if (flags.all) {
      this.log(`Account: ${response.content.account}`)
      this.log(
        `Balance:     ${CurrencyUtils.render(response.content.confirmed, true, flags.ore)}`,
      )
      this.log(
        `Unconfirmed: ${CurrencyUtils.render(response.content.unconfirmed, true, flags.ore)}`,
      )
      this.log(
        `Pending:     ${CurrencyUtils.render(response.content.pending, true, flags.ore)}`,
      )
      return
    }

    this.log(`Account: ${response.content.account}`)
    this.log(`Balance: ${CurrencyUtils.render(response.content.confirmed, true, flags.ore)}`)
  }

  explainBalance(response: GetBalanceResponse, ore: boolean): void {
    const unconfirmed = CurrencyUtils.decode(response.unconfirmed)
    const pending = CurrencyUtils.decode(response.pending)
    const confirmed = CurrencyUtils.decode(response.confirmed)

    const pendingDelta = pending - unconfirmed
    const unconfirmedDelta = unconfirmed - confirmed

    this.log(`Account: ${response.account}`)
    this.log('')

    this.log(`Your balance is made of notes on the chain that are safe to spend`)
    this.log(`Balance: ${CurrencyUtils.render(confirmed, true, ore)}`)
    this.log('')

    this.log(
      `${response.unconfirmedCount} notes worth ${CurrencyUtils.render(
        unconfirmedDelta,
        ore,
      )} are on the chain within ${response.minimumBlockConfirmations.toString()} blocks of the head`,
    )
    this.log(`Unconfirmed: ${CurrencyUtils.render(unconfirmed, ore)}`)
    this.log('')

    this.log(
      `${response.pendingCount} notes worth ${CurrencyUtils.render(
        pendingDelta,
        ore,
      )} are waiting for miners to add them to the chain`,
    )
    this.log(`Pending: ${CurrencyUtils.render(pending, ore)}`)
  }
}
