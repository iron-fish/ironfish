/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '@ironfish/sdk'
import { Flags, ux } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class WhichCommand extends IronfishCommand {
  static description = `Show the account currently used.

  By default all commands will use this account when deciding what
  keys to use. If no account is specified as the default, you must
  specify the account in the command using --account <name>`

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
    const { flags } = await this.parse(WhichCommand)

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
