/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
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
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(WhichCommand)

    const client = await this.sdk.connectRpc()

    const {
      content: {
        accounts: [accountName],
      },
    } = await client.getAccounts({ default: true, displayName: flags.displayName })

    if (!accountName) {
      this.log(
        'There is currently no account being used.\n' +
          ' * Create an account: "ironfish accounts:create"\n' +
          ' * List all accounts: "ironfish accounts:list"\n' +
          ' * Use an existing account: "ironfish accounts:use <name>"',
      )
      this.exit(0)
    }

    this.log(accountName)
  }
}
