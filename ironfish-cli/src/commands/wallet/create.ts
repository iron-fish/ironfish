/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Args, ux } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class CreateCommand extends IronfishCommand {
  static description = `Create a new account for sending and receiving coins`

  static args = {
    account: Args.string({
      required: false,
      description: 'Name of the account',
    }),
  }

  static flags = {
    ...RemoteFlags,
  }

  async start(): Promise<void> {
    const { args } = await this.parse(CreateCommand)
    let name = args.account as string

    if (!name) {
      name = await ux.prompt('Enter the name of the account', {
        required: true,
      })
    }

    const client = await this.sdk.connectRpc()

    this.log(`Creating account ${name}`)
    const result = await client.wallet.createAccount({ name })

    const { publicAddress, isDefaultAccount } = result.content

    this.log(`Account ${name} created with public address ${publicAddress}`)

    if (isDefaultAccount) {
      this.log(`The default account is now: ${name}`)
    } else {
      this.log(`Run "ironfish wallet:use ${name}" to set the account as default`)
    }
  }
}
