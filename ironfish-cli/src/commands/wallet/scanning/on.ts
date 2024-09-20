/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Args } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import * as ui from '../../../ui'

export class ScanningOnCommand extends IronfishCommand {
  static description = `turn on scanning for an account

Scanning is on by default. The wallet will scan the blockchain for new account transactions.`

  static args = {
    account: Args.string({
      required: true,
      description: 'Name of the account to update',
    }),
  }

  static flags = {
    ...RemoteFlags,
  }

  async start(): Promise<void> {
    const { args } = await this.parse(ScanningOnCommand)
    const { account } = args

    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    await client.wallet.setScanning({
      account: account,
      enabled: true,
    })
    this.log(`Turned on scanning for account ${account}.`)
  }
}
