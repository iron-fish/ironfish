/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Args } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

export default class Show extends IronfishCommand {
  static description = 'Show the heaviest chain'

  static flags = {
    ...LocalFlags,
  }

  static args = {
    start: Args.integer({
      default: -50,
      required: false,
      description: 'The sequence to start at (inclusive, genesis block is 1)',
    }),
    stop: Args.integer({
      required: false,
      description: 'The sequence to end at (inclusive)',
    }),
  }

  async start(): Promise<void> {
    const { args } = await this.parse(Show)
    const { start, stop } = args

    this.log(`Getting the chain blocks...`)
    await this.sdk.client.connect()

    const data = await this.sdk.client.chain.showChain({ start, stop })

    data.content.content.forEach((content) => this.log(content))
  }
}
