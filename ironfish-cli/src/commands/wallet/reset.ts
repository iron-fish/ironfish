/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Args, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { confirmOrQuit } from '../../ui'

export class ResetCommand extends IronfishCommand {
  static description = `resets an account's balance and rescans`

  static args = {
    account: Args.string({
      required: true,
      description: 'Name of the account to reset',
    }),
  }

  static flags = {
    ...RemoteFlags,
    resetCreated: Flags.boolean({
      default: false,
      description: 'Reset the accounts birthday',
    }),
    resetScanning: Flags.boolean({
      default: false,
      description: 'Reenable scanning on the account ',
    }),
    confirm: Flags.boolean({
      default: false,
      description: 'Confirm download without asking',
    }),
  }

  async start(): Promise<void> {
    const { args, flags } = await this.parse(ResetCommand)
    const { account } = args

    await confirmOrQuit(
      `Are you sure you want to reset the account '${account}'?` +
        `\nThis will delete your transactions.` +
        `\nYour keys will not be deleted.` +
        `\nAre you sure?`,
      flags.confirm,
    )

    const client = await this.connectRpc()

    await client.wallet.resetAccount({
      account,
      resetCreatedAt: flags.resetCreated,
      resetScanningEnabled: flags.resetScanning,
    })

    this.log(`Account '${account}' has been reset.`)
  }
}
