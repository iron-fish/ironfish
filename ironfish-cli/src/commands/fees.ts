/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { RpcRequestError } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../command'
import { RemoteFlags } from '../flags'

const DEFAULT_BLOCKS_TO_FETCH = 10

export class FeeCommand extends IronfishCommand {
  static description = ``

  static flags = {
    ...RemoteFlags,
  }

  static args = [
    {
      name: 'blocks',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'latest number of blocks to get fee distribution for',
    },
  ]

  async start(): Promise<void> {
    const { args } = await this.parse(FeeCommand)
    const blocks = args.blocks as number | null

    const client = await this.sdk.connectRpc()

    const numOfBlocks = blocks || DEFAULT_BLOCKS_TO_FETCH
    const response = await client.getFees({ numOfBlocks })

    this.log(
      `Fee distribution for last ${numOfBlocks} block${numOfBlocks > 1 ? 's' : ''}: (${response.content.startBlock} - ${response.content.endBlock})\np25: ${response.content.p25} ORE\np50: ${response.content.p50} ORE\np75: ${response.content.p75} ORE`,
    )
  }
}
