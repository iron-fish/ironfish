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
      description: 'Minimum number of blocks confirmations for a transaction',
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
      confirmations: flags.confirmations,
    })
    const assetId = response.content.assetId

    if (flags.explain) {
      this.explainBalance(response.content, assetId)
      return
    }

    if (flags.all) {
      this.log(`Account: ${response.content.account}`)
      this.log(`Head Hash: ${response.content.blockHash || 'NULL'}`)
      this.log(`Head Sequence: ${response.content.sequence || 'NULL'}`)
      this.log(
        `Available:   ${CurrencyUtils.renderIron(response.content.available, true, assetId)}`,
      )
      this.log(
        `Confirmed:   ${CurrencyUtils.renderIron(response.content.confirmed, true, assetId)}`,
      )
      this.log(
        `Unconfirmed: ${CurrencyUtils.renderIron(response.content.unconfirmed, true, assetId)}`,
      )
      this.log(
        `Pending:     ${CurrencyUtils.renderIron(response.content.pending, true, assetId)}`,
      )
      return
    }

    this.log(`Account: ${response.content.account}`)
    this.log(
      `Available Balance: ${CurrencyUtils.renderIron(
        response.content.available,
        true,
        assetId,
      )}`,
    )
  }

  explainBalance(response: GetBalanceResponse, assetId: string): void {
    const unconfirmed = CurrencyUtils.decode(response.unconfirmed)
    const confirmed = CurrencyUtils.decode(response.confirmed)
    const pending = CurrencyUtils.decode(response.pending)
    const available = CurrencyUtils.decode(response.available)

    const unconfirmedDelta = unconfirmed - confirmed
    const pendingDelta = pending - unconfirmed

    this.log(`Account: ${response.account}`)

    this.log(
      `Your balance is calculated from transactions on the chain through block ${
        response.blockHash ?? 'NULL'
      } at sequence ${response.sequence ?? 'NULL'}`,
    )
    this.log('')

    this.log(`Your available balance is made of notes on the chain that are safe to spend`)
    this.log(`Available: ${CurrencyUtils.renderIron(available, true, assetId)}`)
    this.log('')

    this.log('Your confirmed balance includes all notes from transactions on the chain')
    this.log(`Confirmed: ${CurrencyUtils.renderIron(confirmed, true, assetId)}`)
    this.log('')

    this.log(
      `${response.unconfirmedCount} transactions worth ${CurrencyUtils.renderIron(
        unconfirmedDelta,
      )} are on the chain within ${response.confirmations} blocks of the head`,
    )
    this.log(`Unconfirmed: ${CurrencyUtils.renderIron(unconfirmed, true, assetId)}`)
    this.log('')

    this.log(
      `${response.pendingCount} transactions worth ${CurrencyUtils.renderIron(
        pendingDelta,
      )} are pending and have not been added to the chain`,
    )
    this.log(`Pending: ${CurrencyUtils.renderIron(pending, true, assetId)}`)
  }
}
