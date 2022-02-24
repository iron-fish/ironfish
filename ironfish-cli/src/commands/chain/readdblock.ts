/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CliUx } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

export default class ReAddBlock extends IronfishCommand {
  static description =
    'Remove and readd a block on the chain if it has no other blocks after it'

  static hidden = true

  static flags = {
    ...LocalFlags,
  }

  static args = [
    {
      name: 'hash',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: true,
      description: 'the hash of the block in hex format',
    },
  ]

  async start(): Promise<void> {
    const { args } = await this.parse(ReAddBlock)
    const hash = Buffer.from(args.hash as string, 'hex')

    CliUx.ux.action.start(`Opening node`)
    const node = await this.sdk.node()
    await node.openDB()
    await node.chain.open()
    CliUx.ux.action.stop('done.')

    const block = await node.chain.getBlock(hash)

    if (!block) {
      this.log(`No block found with hash ${hash.toString('hex')}`)
      return this.exit(0)
    }

    await node.chain.removeBlock(hash)
    await node.chain.addBlock(block)

    this.log('Block has been reimported.')
  }
}
