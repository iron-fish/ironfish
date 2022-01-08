/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { flags } from '@oclif/command'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class ListCommand extends IronfishCommand {
  static description = `List all the accounts on the node`

  static flags = {
    ...RemoteFlags,
    displayName: flags.boolean({
      default: false,
      description: `Display a hash of the account's read-only keys along with the account name`,
    }),
  }

  async start(): Promise<void> {
    const { flags } = this.parse(ListCommand)

    const client = await this.sdk.connectRpc()

    const response = await client.getAccounts({ displayName: flags.displayName })

    if (response.content.accounts.length === 0) {
      this.log('you have no accounts')
    }

    for (const name of response.content.accounts) {
      this.log(name)
    }
  }
}
