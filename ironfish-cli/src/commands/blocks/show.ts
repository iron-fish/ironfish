/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Args } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

export default class ShowBlock extends IronfishCommand {
  static description = 'Show the block header of a requested hash or sequence'

  static args = {
    search: Args.string({
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: true,
      description: 'The hash or sequence of the block to look at',
    }),
  }

  static flags = {
    ...LocalFlags,
  }

  async start(): Promise<void> {
    const { args } = await this.parse(ShowBlock)
    const search = args.search

    const client = await this.sdk.connectRpc()
    const data = await client.chain.getBlock({ search })

    this.log(JSON.stringify(data.content, undefined, '  '))
  }
}
