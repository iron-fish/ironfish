/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { checkWalletUnlocked, confirmOrQuit } from '../../ui'
import { useAccount } from '../../utils'

export class ResetCommand extends IronfishCommand {
  static description = `resets an account's balance and rescans`

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'a',
      description: 'Name of the account to reset',
    }),
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
    const { flags } = await this.parse(ResetCommand)

    const client = await this.connectRpc()
    await checkWalletUnlocked(client)

    const account = await useAccount(client, flags.account)

    await confirmOrQuit(
      `Are you sure you want to reset the account '${account}'?` +
        `\nThis will delete your transactions.` +
        `\nYour keys will not be deleted.` +
        `\nAre you sure?`,
      flags.confirm,
    )

    await client.wallet.resetAccount({
      account,
      resetCreatedAt: flags.resetCreated,
      resetScanningEnabled: flags.resetScanning,
    })

    this.log(`Account '${account}' has been reset.`)
  }
}
