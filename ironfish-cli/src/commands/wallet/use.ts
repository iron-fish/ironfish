/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Args, Flags, ux } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { Assert } from '@ironfish/sdk'

export class UseCommand extends IronfishCommand {
  static description = 'Change the default account used by all commands'

  static args = {
    account: Args.string({
      required: true,
      description: 'Name of the account',
    }),
  }

  static flags = {
    ...RemoteFlags,
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
    const { args, flags } = await this.parse(UseCommand)
    const { account } = args
    const client = await this.sdk.connectRpc()
    
    let passphrase = flags.passphrase
    const status = await client.wallet.getNodeStatus()
    if (!passphrase && status.content.accounts.locked) {
      passphrase = await ux.prompt('Enter your passphrase to unlock the wallet', {
        required: true,
      })
    }

    Assert.isNotUndefined(passphrase)
    await client.wallet.unlock({
      passphrase,
      timeout: flags.timeout,
    })

    await client.wallet.useAccount({ account })
    this.log(`The default account is now: ${account}`)
  }
}
