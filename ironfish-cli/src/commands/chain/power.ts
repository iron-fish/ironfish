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
    const inputBlocks = args.blocks as number | undefined
    const inputSequence = args.sequence as number | undefined

    await this.sdk.client.connect()

    const data = await this.sdk.client.getNetworkHashPower({
      blocks: inputBlocks,
      sequence: inputSequence,
    })

    const headSequence = (await this.sdk.client.getChainInfo()).content.currentBlockIdentifier
      .index

    const { hashesPerSecond, blocks, sequence } = data.content
    const formattedHashesPerSecond = FileUtils.formatHashRate(hashesPerSecond)

    const distanceFromHead = Number(headSequence) - sequence

    this.log(
      `The network is operating at ${formattedHashesPerSecond} over the last ${blocks} blocks ending at block ${sequence} ${
        distanceFromHead !== 0 ? `(head - ${distanceFromHead})` : '(head)'
      }.`,
    )
  }
}
