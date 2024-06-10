/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Args, Flags, ux } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class ResetCommand extends IronfishCommand {
  static description = `Resets the transaction of an account but keeps all keys.`

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

  static args = {
    account: Args.string({
      required: true,
      description: 'Name of the account to reset',
    }),
  }

  async start(): Promise<void> {
    const { args, flags } = await this.parse(ResetCommand)
    const { account } = args

    if (!flags.confirm) {
      const confirm = await ux.confirm(
        `Are you sure you want to reset the account ${account}` +
          `\nThis will delete your transactions.` +
          `\nYour keys will not be deleted.` +
          `\nAre you sure? (Y)es / (N)o`,
      )

      if (!confirm) {
        this.exit(0)
      }
    }

    const client = await this.sdk.connectRpc()

    await client.wallet.resetAccount({
      account,
      resetCreatedAt: flags.resetCreated,
      resetScanningEnabled: flags.resetScanning,
    })

    this.log(`Account ${account} has been reset.`)
  }
}
