/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Args, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { checkWalletUnlocked } from '../../ui'

export class UseCommand extends IronfishCommand {
  static description = 'change the default wallet account'

  static args = {
    account: Args.string({
      description: 'Name of the account',
    }),
  }

  static flags = {
    ...RemoteFlags,
    unset: Flags.boolean({
      description: 'Clear the default account',
    }),
  }

  async start(): Promise<void> {
    const { args, flags } = await this.parse(UseCommand)
    const { account } = args
    const { unset } = flags

    if (!account && !unset) {
      this.error('You must provide the name of an account')
    }

    const client = await this.connectRpc()
    await checkWalletUnlocked(client)

    await client.wallet.useAccount({ account })
    if (account == null) {
      this.log('The default account has been unset')
    } else {
      this.log(`The default account is now: ${account}`)
    }
  }
}
