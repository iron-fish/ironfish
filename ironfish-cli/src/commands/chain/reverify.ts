/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { flags } from '@oclif/command'
import { cli } from 'cli-ux'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

export default class Reverify extends IronfishCommand {
  static description = 'Re-verify a block that has been added to the chain'

  static hidden = true

  static flags = {
    ...LocalFlags,
    hash: flags.string({
      char: 'h',
      parse: (input: string): string => input.trim(),
      required: false,
      description: 'the hash of the block to look at',
    }),
    sequence: flags.integer({
      char: 's',
      required: false,
      description: 'the sequence of the block to look at',
    }),
    all: flags.integer({
      char: 'a',
      required: false,
      description: 'look at all blocks up to a given height',
    }),
  }

  async start(): Promise<void> {
    const { flags } = this.parse(Reverify)

    if (flags.all) {
      cli.action.start(`Opening node`)
      const node = await this.sdk.node()
      await node.openDB()
      await node.chain.open()
      cli.action.stop('done.')

      let blocks = []

      this.log('Collecting blocks...')
      for (let i = 1; i <= flags.all; i++) {
        const hashes = await node.chain.getHashesAtSequence(i)
        const blocksFromHashes = await Promise.all(
          hashes.map((hash) => node.chain.getBlock(hash)),
        )
        blocks.push(...blocksFromHashes)
      }

      for (const block of blocks) {
        if (block === null) {
          continue
        }
        this.log(`Block sequence: ${block.header.sequence}`)
        this.log(`Block hash: ${block.header.hash.toString('hex')}`)
        this.log(`Number of transactions: ${block.transactions.length}`)
        const prev_header = await node.chain.getHeader(block.header.previousBlockHash)
        const result = await node.chain.verifier.verifyBlockAdd(block, prev_header)
        this.log(`Result: ${JSON.stringify(result)}`)
      }
    }

    if (flags.hash === undefined && flags.sequence === undefined) {
      this.log(`Please supply either a hash or sequence number`)
      this.exit(1)
    }

    const hash = flags.hash ? Buffer.from(flags.hash, 'hex') : undefined
    const sequence = flags.sequence

    cli.action.start(`Opening node`)
    const node = await this.sdk.node()
    await node.openDB()
    await node.chain.open()
    cli.action.stop('done.')

    let blocks = []

    if (sequence) {
      const hashes = await node.chain.getHashesAtSequence(sequence)
      blocks = await Promise.all(hashes.map((hash) => node.chain.getBlock(hash)))
    } else if (hash) {
      const block = await node.chain.getBlock(hash)

      if (!block) {
        this.log(`No block found with hash ${hash.toString('hex')}`)
        this.exit(0)
      }

      blocks.push(block)
    }

    for (const block of blocks) {
      if (block === null) {
        continue
      }
      this.log(`Block sequence: ${block.header.sequence}`)
      this.log(`Block hash: ${block.header.hash.toString('hex')}`)
      this.log(`Number of transactions: ${block.transactions.length}`)
      const prev_header = await node.chain.getHeader(block.header.previousBlockHash)
      const result = await node.chain.verifier.verifyBlockAdd(block, prev_header)
      this.log(`Result: ${JSON.stringify(result)}`)
    }
  }
}
