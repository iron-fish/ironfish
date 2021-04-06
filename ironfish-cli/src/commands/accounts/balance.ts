/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { displayIronAmountWithCurrency, oreToIron } from 'ironfish'

export class BalanceCommand extends IronfishCommand {
  static description = `Display the account balance`

  static flags = {
    ...RemoteFlags,
  }

  static args = [
    {
      name: 'account',
      parse: (input: string): string => input.trim(),
      required: false,
      description: 'name of the account to export',
    },
  ]

  async start(): Promise<void> {
    const { args } = this.parse(BalanceCommand)
    const account = args.account as string | undefined

    await this.sdk.client.connect()

    const response = await this.sdk.client.getAccountBalance({
      account: account,
    })

    const { confirmedBalance, unconfirmedBalance } = response.content

    this.log(
      `The account balance is: ${displayIronAmountWithCurrency(
        oreToIron(Number(unconfirmedBalance)),
        true,
      )}`,
    )
    this.log(
      `Amount available to spend: ${displayIronAmountWithCurrency(
        oreToIron(Number(confirmedBalance)),
        true,
      )}`,
    )
  }
}
