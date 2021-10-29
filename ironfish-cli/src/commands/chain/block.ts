/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

export default class Block extends IronfishCommand {
  static description = 'Show the block header of a requested hash'

  static args = [
    {
      name: 'hash',
      parse: (input: string): string => input.trim(),
      required: true,
      description: 'the hash of the block to look at',
    },
  ]

  static flags = {
    ...LocalFlags,
  }

  async start(): Promise<void> {
    const { args } = this.parse(Block)
    const hash = args.hash as string

    const client = await this.sdk.connectRpc(true)
    const data = await client.getBlockInfo({ hash })
    this.log(JSON.stringify(data.content, undefined, '  '))
  }
}
