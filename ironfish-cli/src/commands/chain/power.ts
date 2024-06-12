/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FileUtils } from '@ironfish/sdk'
import { Args, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

export default class Power extends IronfishCommand {
  static description = "Show the network's hash power per second"

  static flags = {
    ...LocalFlags,
    history: Flags.integer({
      required: false,
      description:
        'The number of blocks to look back to calculate the network hashes per second',
    }),
  }

  static args = {
    block: Args.integer({
      required: false,
      description: 'The sequence of the block to estimate network speed for',
    }),
  }

  async start(): Promise<void> {
    const { flags, args } = await this.parse(Power)
    const { block } = args

    const client = await this.sdk.connectRpc()

    const data = await client.chain.getNetworkHashPower({
      sequence: block,
      blocks: flags.history,
    })

    const formattedHashesPerSecond = FileUtils.formatHashRate(data.content.hashesPerSecond)

    this.log(
      `The network power for block ${data.content.sequence} was ${formattedHashesPerSecond} averaged over ${data.content.blocks} previous blocks.`,
    )
  }
}
