/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Args, ux } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class BroadcastCommand extends IronfishCommand {
  static description = 'broadcast a transaction to the network'

  static args = {
    transaction: Args.string({
      required: true,
      description: 'The transaction in hex encoding',
    }),
  }

  static flags = {
    ...RemoteFlags,
  }

  async start(): Promise<void> {
    const { args } = await this.parse(BroadcastCommand)
    const { transaction } = args

    ux.action.start(`Broadcasting transaction`)
    const client = await this.connectRpc()
    const response = await client.chain.broadcastTransaction({ transaction })

    if (response.content.accepted && response.content.broadcasted) {
      ux.action.stop(`Transaction broadcasted: ${response.content.hash}`)
    } else {
      ux.action.stop()
      this.error(
        `Transaction broadcast may have failed.${
          !response.content.accepted ? ' Transaction was not accepted by the node.' : ''
        }${
          !response.content.broadcasted
            ? ' Transaction was not broadcasted to the network.'
            : ''
        }`,
      )
    }
  }
}
