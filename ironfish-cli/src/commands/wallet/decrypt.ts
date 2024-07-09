/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags, ux } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class DecryptCommand extends IronfishCommand {
  static description = 'Decrypt the wallet accounts for use'

  static flags = {
    ...RemoteFlags,
    passphrase: Flags.string({
      required: false,
      description: 'Passphrase for wallet',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(DecryptCommand)

    let passphrase = flags.passphrase
    if (!passphrase) {
      passphrase = await ux.prompt('Enter your passphrase to unlock the wallet', {
        required: true,
      })
    }

    const client = await this.sdk.connectRpc()
    await client.wallet.decrypt({ passphrase })
    this.log(`Decrypted the wallet`)
  }
}
