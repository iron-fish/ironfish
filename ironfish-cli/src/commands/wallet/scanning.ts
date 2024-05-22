/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { parseBoolean } from '../../args'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class ScanningCommand extends IronfishCommand {
  static description = `Enable or disable scanning for an account`

  static flags = {
    ...RemoteFlags,
  }

  static args = [
    {
      name: 'account',
      required: true,
      description: 'Name of the account to update',
    },
    {
      name: 'enabled',
      parse: (input: string): Promise<boolean | null> => Promise.resolve(parseBoolean(input)),
      required: true,
      description: 'True if scanning should be enabled, else false',
    },
  ]

  async start(): Promise<void> {
    const { args } = await this.parse(ScanningCommand)
    const account = args.account as string | undefined
    const enabled = args.enabled as boolean | null | undefined

    if (account == null) {
      this.error(`Must pass a valid account name.`)
    }

    if (enabled == null) {
      this.error(`Must pass either true or false.`)
    }

    const client = await this.sdk.connectRpc()

    if (enabled) {
      await client.wallet.startScanning({
        account: account,
      })
      this.log(`Started scanning for account ${account}.`)
    } else {
      await client.wallet.stopScanning({
        account: account,
      })
      this.log(`Stopped scanning for account ${account}.`)
    }
  }
}
