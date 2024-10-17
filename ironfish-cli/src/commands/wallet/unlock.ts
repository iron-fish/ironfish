/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DEFAULT_UNLOCK_TIMEOUT_MS, RpcRequestError } from '@ironfish/sdk'
import { TimeUtils } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { inputPrompt } from '../../ui'

export class UnlockCommand extends IronfishCommand {
  static description = 'unlock accounts in the wallet'

  static flags = {
    ...RemoteFlags,
    passphrase: Flags.string({
      description: 'Passphrase to unlock the wallet with',
    }),
    timeout: Flags.integer({
      description:
        'How long to unlock the wallet for in ms. Use -1 to keep the wallet unlocked until the process stops',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(UnlockCommand)

    const client = await this.connectRpc()

    const response = await client.wallet.getAccountsStatus()
    if (!response.content.encrypted) {
      this.log('Wallet is already decrypted')
      this.exit(1)
    }

    let passphrase = flags.passphrase
    if (!passphrase) {
      passphrase = await inputPrompt('Enter your passphrase to unlock the wallet', true, {
        password: true,
      })
    }

    try {
      await client.wallet.unlock({
        passphrase,
        timeout: flags.timeout,
      })
    } catch (e) {
      if (e instanceof RpcRequestError) {
        this.log('Wallet unlock failed')
        this.exit(1)
      }

      throw e
    }

    const timeout = flags.timeout || DEFAULT_UNLOCK_TIMEOUT_MS
    if (timeout === -1) {
      this.log(
        'Unlocked the wallet. Call wallet:lock or stop the node to lock the wallet again.',
      )
    } else {
      const timeoutDuration = TimeUtils.renderSpan(timeout)
      this.log(`Unlocked the wallet for ${timeoutDuration}.`)
    }

    this.exit(0)
  }
}
