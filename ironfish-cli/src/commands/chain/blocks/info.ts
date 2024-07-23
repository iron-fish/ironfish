/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BufferUtils, TimeUtils } from '@ironfish/sdk'
import { Args } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { LocalFlags } from '../../../flags'
import * as ui from '../../../ui'

export default class BlockInfo extends IronfishCommand {
  static description = 'Show the block header of a requested hash or sequence'

  static args = {
    search: Args.string({
      required: true,
      description: 'The hash or sequence of the block to look at',
    }),
  }

  static flags = {
    ...LocalFlags,
  }

  static enableJsonFlag: boolean = true

  async start(): Promise<unknown> {
    const { args } = await this.parse(BlockInfo)
    const { search } = args

    const client = await this.sdk.connectRpc()
    const data = await client.chain.getBlock({ search })
    const blockData = data.content

    this.log(
      ui.card({
        Hash: blockData.block.hash,
        Confirmed: blockData.metadata.confirmed,
        Fork: !blockData.metadata.main,
        Sequence: blockData.block.sequence,
        'Previous Block Hash': blockData.block.previousBlockHash,
        Difficulty: blockData.block.difficulty,
        Timestamp: TimeUtils.renderString(blockData.block.timestamp),
        Graffiti: BufferUtils.toHuman(Buffer.from(blockData.block.graffiti, 'hex')),
        'Transaction Count': blockData.block.transactions.length,
      }),
    )

    return blockData
  }
}
