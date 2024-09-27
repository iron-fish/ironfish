/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { RpcRequestError } from '@ironfish/sdk'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class LockCommand extends IronfishCommand {
  static description = 'lock accounts in the wallet'

  static flags = {
    ...RemoteFlags,
  }

  async start(): Promise<void> {
    const client = await this.connectRpc()

    const response = await client.wallet.getAccountsStatus()
    if (!response.content.encrypted) {
      this.log('Wallet is decrypted')
      this.exit(1)
    }

    try {
      await client.wallet.lock()
    } catch (e) {
      if (e instanceof RpcRequestError) {
        this.log('Wallet lock failed')
        this.exit(1)
      }

      throw e
    }

    this.log('Locked the wallet')
    this.exit(0)
  }
}
