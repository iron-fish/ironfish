/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FileUtils } from '@ironfish/sdk'
import { parseNumber } from '../../args'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

export default class Power extends IronfishCommand {
  static description = "Show the network's hash power (hash/s)"

  static flags = {
    ...LocalFlags,
  }

  static args = [
    {
      name: 'blocks',
      parse: (input: string): Promise<number | null> => Promise.resolve(parseNumber(input)),
      required: false,
      description:
        'The number of blocks to look back to calculate the power. This value must be > 0',
    },
    {
      name: 'sequence',
      parse: (input: string): Promise<number | null> => Promise.resolve(parseNumber(input)),
      required: false,
      description: 'The sequence of the latest block from when to estimate network speed ',
    },
  ]

  async start(): Promise<void> {
    const { args } = await this.parse(Power)
    const inputBlocks = args.blocks as number | null | undefined
    const inputSequence = args.sequence as number | null | undefined

    await this.sdk.client.connect()

    const data = await this.sdk.client.getNetworkHashPower({
      blocks: inputBlocks,
      sequence: inputSequence,
    })

    const { hashesPerSecond, blocks, sequence } = data.content
    const formattedHashesPerSecond = FileUtils.formatHashRate(hashesPerSecond)

    this.log(
      `The network power for block ${sequence} was ${formattedHashesPerSecond} averaged over ${blocks} previous blocks.`,
    )
  }
}
