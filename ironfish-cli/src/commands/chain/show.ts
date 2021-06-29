/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { parseNumber } from '../../args'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

export default class Show extends IronfishCommand {
  static description = 'Show the heaviest chain'

  static flags = {
    ...LocalFlags,
  }

  static args = [
    {
      name: 'start',
      parse: parseNumber,
      default: -50,
      required: false,
      description: 'the height to start at (inclusive, genesis block is 1)',
    },
    {
      name: 'stop',
      parse: parseNumber,
      required: false,
      description: 'the height to end at (inclusive)',
    },
  ]

  async start(): Promise<void> {
    const { args } = this.parse(Show)
    const start = args.start as number | null
    const stop = args.stop as number | null

    this.log(`Getting the chain blocks...`)
    await this.sdk.client.connect()

    const data = await this.sdk.client.showChain({ start, stop })

    data.content.content.forEach((content) => this.log(content))
  }
}
