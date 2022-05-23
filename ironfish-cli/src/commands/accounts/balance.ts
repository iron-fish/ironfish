/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { displayIronAmountWithCurrency, oreToIron } from '@ironfish/sdk'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class BalanceCommand extends IronfishCommand {
  static description = `Display the account balance`

  static flags = {
    ...RemoteFlags,
  }

  static args = [
    {
      name: 'account',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'name of the account to get balance for',
    },
  ]

  async start(): Promise<void> {
    const { args } = await this.parse(BalanceCommand)
    const account = args.account as string | undefined

    const client = await this.sdk.connectRpc()

    const response = await client.getAccountBalance({
      account: account,
    })

    const { account: accountResponse, confirmed, unconfirmed } = response.content

    this.log(`Account - ${String(accountResponse)}\n`)
    this.log(
      `The balance is: ${displayIronAmountWithCurrency(oreToIron(Number(unconfirmed)), true)}`,
    )
    this.log(
      `Amount available to spend: ${displayIronAmountWithCurrency(
        oreToIron(Number(confirmed)),
        true,
      )}`,
    )
  }
}
