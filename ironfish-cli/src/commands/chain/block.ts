/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { GraffitiUtils } from 'ironfish'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

export default class Block extends IronfishCommand {
  static description = 'Show the block header of a requested hash'

  static args = [
    {
      name: 'search',
      parse: (input: string): string => input.trim(),
      required: true,
      description: 'the hash or sequence of the block to look at',
    },
  ]

  static flags = {
    ...LocalFlags,
  }

  async start(): Promise<void> {
    const { args } = this.parse(Block)
    const search = args.search as string

    const client = await this.sdk.connectRpc()
    const data = await client.getBlockInfo({ search })

    // Render graffiti to human form
    data.content.block.graffiti = GraffitiUtils.toHuman(
      Buffer.from(data.content.block.graffiti, 'hex'),
    )

    this.log(JSON.stringify(data.content, undefined, '  '))
  }
}
