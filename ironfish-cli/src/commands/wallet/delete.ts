/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class DeleteCommand extends IronfishCommand {
  static description = `Permanently delete an account`

  static args = [
    {
      name: 'account',
      required: true,
      description: 'Name of the account',
    },
  ]

  static flags = {
    ...RemoteFlags,
    confirm: Flags.boolean({
      description: 'Suppress the confirmation prompt',
    }),
    wait: Flags.boolean({
      description:
        'Wait for the account to be deleted, rather than the default of marking the account for deletion then returning immediately',
    }),
  }

  async start(): Promise<void> {
    const { args, flags } = await this.parse(DeleteCommand)
    const confirm = flags.confirm
    const wait = flags.wait
    const account = args.account as string

    const client = await this.sdk.connectRpc()

    CliUx.ux.action.start(`Deleting account '${account}'`)
    const response = await client.wallet.removeAccount({ account, confirm, wait })
    CliUx.ux.action.stop()

    if (response.content.needsConfirm) {
      const value = await CliUx.ux.prompt(`Are you sure? Type ${account} to confirm`)

      if (value !== account) {
        this.log(`Aborting: ${value} did not match ${account}`)
        this.exit(1)
      }

      CliUx.ux.action.start(`Deleting account '${account}'`)
      await client.wallet.removeAccount({ account, confirm: true, wait })
      CliUx.ux.action.stop()
    }

    this.log(`Account '${account}' successfully deleted.`)
  }
}
