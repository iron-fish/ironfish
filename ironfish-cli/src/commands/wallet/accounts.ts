/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '@ironfish/sdk'
import { Flags, ux } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class AccountsCommand extends IronfishCommand {
  static description = `List all the accounts on the node`

  static flags = {
    ...RemoteFlags,
    displayName: Flags.boolean({
      default: false,
      description: `Display a hash of the account's read-only keys along with the account name`,
    }),
    passphrase: Flags.string({
      required: false,
      description: 'Passphrase for wallet',
    }),
    timeout: Flags.integer({
      required: false,
      description: 'Timeout to unlock for wallet',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(AccountsCommand)

    const client = await this.sdk.connectRpc()

    let passphrase = flags.passphrase
    const status = await client.wallet.getNodeStatus()
    if (status.content.accounts.locked && !passphrase) {
      passphrase = await ux.prompt('Enter your passphrase to unlock the wallet', {
        required: true,
      })
    }

    if (status.content.accounts.locked) {
      Assert.isNotUndefined(passphrase)
      await client.wallet.unlock({
        passphrase,
        timeout: flags.timeout,
      })
    }

    const response = await client.wallet.getAccounts({ displayName: flags.displayName })

    if (response.content.accounts.length === 0) {
      this.log('you have no accounts')
    }

    for (const name of response.content.accounts) {
      this.log(name)
    }
  }
}
