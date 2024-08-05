/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class AccountsCommand extends IronfishCommand {
  static description = `list accounts in the wallet`

  static flags = {
    ...RemoteFlags,
    displayName: Flags.boolean({
      default: false,
      description: `Display a hash of the account's read-only keys along with the account name`,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(AccountsCommand)

    const client = await this.connectRpc()

    const response = await client.wallet.getAccounts({ displayName: flags.displayName })

    if (response.content.accounts.length === 0) {
      this.log('you have no accounts')
    }

    for (const name of response.content.accounts) {
      this.log(name)
    }
  }
}
