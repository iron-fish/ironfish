/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Args } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { checkWalletUnlocked } from '../../ui'

export class RenameCommand extends IronfishCommand {
  static description = 'rename the name of an account'

  static args = {
    old_name: Args.string({
      required: true,
      description: 'Old account to rename',
    }),
    new_name: Args.string({
      required: true,
      description: 'New name for the account',
    }),
  }

  static flags = {
    ...RemoteFlags,
  }

  async start(): Promise<void> {
    const { args } = await this.parse(RenameCommand)

    const client = await this.connectRpc()
    await checkWalletUnlocked(client)

    await client.wallet.renameAccount({ account: args.old_name, newName: args.new_name })
    this.log(`Account ${args.old_name} renamed to ${args.new_name}`)
  }
}
