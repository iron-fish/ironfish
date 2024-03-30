/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { RpcClient } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../command'
import { RemoteFlags } from '../flags'

export class FeeCommand extends IronfishCommand {
  static description = `Get fee distribution for most recent blocks`

  static flags = {
    ...RemoteFlags,
    explain: Flags.boolean({
      default: false,
      description: 'Explain fee rates',
    }),
  }

  async start(): Promise<void> {
    await this.parse(FeeCommand)
    const client = await this.sdk.connectRpc()

    const result = await Promise.all([
      this.test(client),
      this.test(client),
      this.test(client),
      this.test(client),
    ])

    console.log('result')
    console.log(result)
  }

  async test(client: RpcClient): Promise<string> {
    try {
      console.log('start')
      await client.wallet.createTransaction({
        outputs: [],
      })
      console.log('success')
      return 'success'
    } catch (e) {
      console.log('error')
      return 'error'
    }
  }
}
