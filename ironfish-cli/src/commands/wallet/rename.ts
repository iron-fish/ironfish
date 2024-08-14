/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Args } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class RenameCommand extends IronfishCommand {
  static description = 'rename the name of an account'

  static args = {
    account: Args.string({
      required: true,
      description: 'Name of the account to rename',
    }),
    newName: Args.string({
      required: true,
      description: 'New name to assign to the account',
    }),
  }

  static flags = {
    ...RemoteFlags,
  }

  async start(): Promise<void> {
    const { args } = await this.parse(RenameCommand)
    const { account, newName } = args

    const client = await this.connectRpc()
    await client.wallet.renameAccount({ account, newName })
    this.log(`Account ${account} renamed to ${newName}`)
  }
}
