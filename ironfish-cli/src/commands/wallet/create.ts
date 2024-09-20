/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Args } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { checkWalletUnlocked, inputPrompt } from '../../ui'

export class CreateCommand extends IronfishCommand {
  static description = `create a new account`

  static args = {
    name: Args.string({
      required: false,
      description: 'Name of the account',
    }),
  }

  static flags = {
    ...RemoteFlags,
  }

  async start(): Promise<void> {
    const { args } = await this.parse(CreateCommand)
    const client = await this.connectRpc()
    await checkWalletUnlocked(client)

    let name = args.name
    if (!name) {
      name = await inputPrompt('Enter the name of the account', true)
    }

    this.log(`Creating account ${name}`)
    const result = await client.wallet.createAccount({ name })

    const { publicAddress, isDefaultAccount } = result.content

    this.log(`Account ${name} created with public address ${publicAddress}`)

    if (isDefaultAccount) {
      this.log(`The default account is now: ${name}`)
    } else {
      this.log(`Run "ironfish wallet:use ${name}" to set the account as default`)
    }

    this.exit(0)
  }
}
