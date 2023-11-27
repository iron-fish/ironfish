/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class RenameCommand extends IronfishCommand {
  static description = 'Change the name of an account'

  static args = [
    {
      name: 'account',
      required: true,
      description: 'Name of the account to rename',
    },
    {
      name: 'new-name',
      required: true,
      description: 'New name to assign to the account',
    },
  ]

  static flags = {
    ...RemoteFlags,
  }

  async start(): Promise<void> {
    const { args } = await this.parse(RenameCommand)
    const account = args.account as string
    const newName = args['new-name'] as string

    const client = await this.sdk.connectRpc()
    await client.wallet.renameAccount({ account, newName })
    this.log(`Account ${account} renamed to ${newName}`)
  }
}
