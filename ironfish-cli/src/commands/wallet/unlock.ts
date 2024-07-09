/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags, ux } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class UnlockCommand extends IronfishCommand {
  static description = 'Unlock the wallet accounts for use'

  static flags = {
    ...RemoteFlags,
    passphrase: Flags.string({
      required: false,
      description: 'Passphrase for wallet',
    }),
    timeout: Flags.integer({
      required: false,
      description: 'Optional timeout for unlock',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(UnlockCommand)
    let passphrase = flags.passphrase
    if (!passphrase) {
      passphrase = await ux.prompt('Enter your passphrase to unlock the wallet', {
        required: true,
      })
    }

    const { timeout } = flags

    const client = await this.sdk.connectRpc()
    await client.wallet.unlock({ passphrase, timeout })
    this.log(`Unlocked the wallet for ${(timeout ?? 5000)}ms`)
  }
}
