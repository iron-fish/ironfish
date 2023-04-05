/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CliUx } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class BroadcastCommand extends IronfishCommand {
  static description = `Broadcast a transaction to the network`

  static flags = {
    ...RemoteFlags,
  }

  static args = [
    {
      name: 'transaction',
      required: true,
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      description: 'The transaction in hex encoding',
    },
  ]

  async start(): Promise<void> {
    const { args } = await this.parse(BroadcastCommand)
    const transaction = args.transaction as string

    CliUx.ux.action.start(`Broadcasting transaction`)
    const client = await this.sdk.connectRpc()
    const response = await client.broadcastTransaction({ transaction })
    CliUx.ux.action.stop()

    if (!response.content?.hash) {
      this.log(`Transaction broadcast failed: ${response.status});
      }`)
      return
    }

    this.log(`Transaction broadcasted: ${response.content.hash}`)
  }
}
