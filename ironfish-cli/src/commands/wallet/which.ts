/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { checkWalletUnlocked } from '../../ui'

export class WhichCommand extends IronfishCommand {
  static description = `show the default wallet account

  By default all commands will use this account when deciding what
  keys to use. If no account is specified as the default, you must
  specify the account in the command using --account <name>`

  static flags = {
    ...RemoteFlags,
    displayName: Flags.boolean({
      default: false,
      description: `Display a hash of the account's read-only keys along with the account name`,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(WhichCommand)

    const client = await this.connectRpc()
    await checkWalletUnlocked(client)

    const response = await client.wallet.getAccountsStatus()
    if (response.content.locked) {
      this.log('Your wallet is locked. Unlock the wallet to access your accounts')
      this.exit(0)
    }

    const {
      content: {
        accounts: [accountName],
      },
    } = await client.wallet.getAccounts({ default: true, displayName: flags.displayName })

    if (!accountName) {
      this.log(
        'There is currently no account being used.\n' +
          ' * Create an account: "ironfish wallet:create"\n' +
          ' * List all accounts: "ironfish wallet:accounts"\n' +
          ' * Use an existing account: "ironfish wallet:use <name>"',
      )
      this.exit(0)
    }

    this.log(accountName)
  }
}
