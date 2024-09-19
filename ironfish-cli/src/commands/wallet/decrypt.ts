/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { RpcRequestError } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { inputPrompt } from '../../ui'

export class DecryptCommand extends IronfishCommand {
  static description = 'decrypt accounts in the wallet'

  static flags = {
    ...RemoteFlags,
    passphrase: Flags.string({
      description: 'Passphrase to decrypt the wallet with',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(DecryptCommand)

    const client = await this.connectRpc()

    const response = await client.wallet.getAccountsStatus()
    if (!response.content.encrypted) {
      this.log('Wallet is already decrypted')
      this.exit(1)
    }

    let passphrase = flags.passphrase
    if (!passphrase) {
      passphrase = await inputPrompt('Enter your passphrase to decrypt the wallet', true, {
        password: true,
      })
    }

    try {
      await client.wallet.decrypt({
        passphrase,
      })
    } catch (e) {
      if (e instanceof RpcRequestError) {
        this.log('Wallet decryption failed')
        this.exit(1)
      }

      throw e
    }

    this.log('Decrypted the wallet')
  }
}
