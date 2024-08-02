/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FileUtils } from '@ironfish/sdk'
import { Args, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { JsonFlags, RemoteFlags } from '../../flags'

export default class Power extends IronfishCommand {
  static description = "show the network's mining power"
  static enableJsonFlag = true

  static args = {
    block: Args.integer({
      required: false,
      description: 'The sequence of the block to estimate network speed for',
    }),
  }

  static flags = {
    ...RemoteFlags,
    ...JsonFlags,
    history: Flags.integer({
      required: false,
      description:
        'The number of blocks to look back to calculate the network hashes per second',
    }),
  }

  async start(): Promise<unknown> {
    const { flags, args } = await this.parse(Power)

    const client = await this.connectRpc()

    const data = await client.chain.getNetworkHashPower({
      sequence: args.block,
      blocks: flags.history,
    })

    const formattedHashesPerSecond = FileUtils.formatHashRate(data.content.hashesPerSecond)

    this.log(
      `The network power for block ${data.content.sequence} was ${formattedHashesPerSecond} averaged over ${data.content.blocks} previous blocks.`,
    )

    return data.content
  }
}
