/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { flags } from '@oclif/command'
import { GENESIS_BLOCK_SEQUENCE, Graph, Assert, IJSON } from 'ironfish'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'
import cli from 'cli-ux'
import fs from 'fs'
import { IronfishBlockSerialized, SerializedBlock } from 'ironfish/src/primitives/block'

interface ProgressBar {
  progress: VoidFunction
  start: (current?: number, total?: number) => void
  stop: VoidFunction
  update: (number: number) => void
  getTotal: () => number
  increment: VoidFunction
}


function parseString(input: string): string {
  return input.trim()
}

export default class ReAdd extends IronfishCommand {
  static description =
    'Remove and readd a block on the chain if its got no other blocks after it'

  static hidden = true

  static flags = {
    ...LocalFlags,
  }

  static args = [
    {
      name: 'hash',
      parse: (input: string): string => input.trim(),
      required: true,
      description: 'the hash of the block in hex format',
    },
  ]

  async start(): Promise<void> {
    const { args } = this.parse(ReAdd)
    const hash = Buffer.from(args.hash as string, 'hex')

    cli.action.start(`Opening node`)
    const node = await this.sdk.node()
    await node.openDB()
    await node.chain.open()
    await node.seed()
    cli.action.stop('done.')

    console.log(node.chain.head?.hash.toString('hex'))

    // const block = await node.chain.getBlock(hash)

    // if (!block) {
    //   this.log(`No block found with has ${hash.toString('hex')}`)
    //   this.exit(0)
    // }

    // await node.chain.removeBlock(hash)
    // await node.chain.addBlock(block)

    // this.log('Export complete')
  }
}
