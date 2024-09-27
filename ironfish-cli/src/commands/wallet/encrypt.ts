/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { RpcRequestError } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { inputPrompt } from '../../ui'

export class EncryptCommand extends IronfishCommand {
  static description = 'encrypt accounts in the wallet'

  static flags = {
    ...RemoteFlags,
    passphrase: Flags.string({
      description: 'Passphrase to encrypt the wallet with',
    }),
    confirm: Flags.boolean({
      description: 'Suppress the passphrase confirmation prompt',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(EncryptCommand)

    const client = await this.connectRpc()

    const response = await client.wallet.getAccountsStatus()
    if (response.content.encrypted) {
      this.log('Wallet is already encrypted')
      this.exit(1)
    }

    let passphrase = flags.passphrase
    if (!passphrase) {
      passphrase = await inputPrompt('Enter a passphrase to encrypt the wallet', true, {
        password: true,
      })
    }

    if (!flags.confirm) {
      const confirmedPassphrase = await inputPrompt('Confirm your passphrase', true, {
        password: true,
      })

      if (confirmedPassphrase !== passphrase) {
        this.log('Passphrases do not match')
        this.exit(1)
      }
    }

    try {
      await client.wallet.encrypt({
        passphrase,
      })
    } catch (e) {
      if (e instanceof RpcRequestError) {
        this.log('Wallet encryption failed')
        this.exit(1)
      }

      throw e
    }

    this.log('Encrypted the wallet')
  }
}
