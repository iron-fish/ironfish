/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BlockchainUtils } from '@ironfish/sdk'
import { Flags, ux } from '@oclif/core'
import { IronfishCommand } from '../../command'

export default class Prune extends IronfishCommand {
  static description = 'delete unused blocks from the blockchain'

  static flags = {
    dry: Flags.boolean({
      default: false,
      description: 'Dry run prune first',
    }),
    prune: Flags.boolean({
      char: 'p',
      default: true,
      allowNo: true,
      description: 'Delete blocks on forks',
    }),
    compact: Flags.boolean({
      char: 'c',
      default: true,
      allowNo: true,
      description: 'Compact the database',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Prune)

    ux.action.start(`Opening node`)
    const node = await this.sdk.node()
    await node.openDB()
    await node.chain.open()
    ux.action.stop('done.')

    if (flags.prune) {
      const { start, stop } = BlockchainUtils.getBlockRange(node.chain, {
        start: 1,
        stop: node.chain.latest.sequence - 100,
      })

      this.log(`Pruning from ${start} to ${stop}`)

      let total = 0

      for (let sequence = stop; sequence >= start; --sequence) {
        const hashes = await node.chain.getHashesAtSequence(sequence)
        const main = await node.chain.getHashAtSequence(sequence)

        const forks = hashes.filter((h) => !main || !h.equals(main))

        if (forks.length > 0) {
          if (!flags.dry) {
            await Promise.all(forks.map((h) => node.chain.removeBlock(h)))
          }

          total += forks.length

          this.log(
            `Pruned ${sequence
              .toString()
              .padStart(node.chain.latest.sequence.toString().length)}: ${
              forks.length
            } (${total})`,
          )
        }
      }

      this.log(`Pruned a total of ${total} forking blocks from ${stop} to ${start}`)
    }

    if (flags.compact) {
      ux.action.start(`Compacting Database`)
      await node.chain.blockchainDb.compact()
      ux.action.stop()
    }

    await node.chain.close()
    await node.closeDB()
  }
}
