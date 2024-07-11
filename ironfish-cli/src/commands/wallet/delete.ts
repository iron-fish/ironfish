/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Args, Flags, ux } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { inputPrompt } from '../../ui'

export class DeleteCommand extends IronfishCommand {
  static description = `Permanently delete an account`

  static args = {
    account: Args.string({
      required: true,
      description: 'Name of the account',
    }),
  }

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
    const { confirm, wait } = flags
    const { account } = args

    const client = await this.sdk.connectRpc()

    ux.action.start(`Deleting account '${account}'`)
    const response = await client.wallet.removeAccount({ account, confirm, wait })
    ux.action.stop()

    if (response.content.needsConfirm) {
      const value = await inputPrompt(`Are you sure? Type ${account} to confirm`)

      if (value !== account) {
        this.log(`Aborting: ${value} did not match ${account}`)
        this.exit(1)
      }

      ux.action.start(`Deleting account '${account}'`)
      await client.wallet.removeAccount({ account, confirm: true, wait })
      ux.action.stop()
    }

    this.log(`Account '${account}' successfully deleted.`)
  }
}
