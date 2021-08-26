/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { flags } from '@oclif/command'
import cli from 'cli-ux'
import { Miner as IronfishMiner, NewBlocksStreamResponse, PromiseUtils } from 'ironfish'
import os from 'os'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class Miner extends IronfishCommand {
  static description = `Start a miner and subscribe to new blocks for the node`

  static flags = {
    ...RemoteFlags,
    threads: flags.integer({
      char: 't',
      default: 1,
      description:
        'number of CPU threads to use for mining. -1 will auto-detect based on number of CPU cores.',
    }),
  }

  async start(): Promise<void> {
    const { flags } = this.parse(Miner)

    let threads = flags.threads
    if (threads === 0 || threads < -1) {
      throw new Error('--threads must be a positive integer or -1.')
    } else if (threads === -1) {
      threads = os.cpus().length
    }

    const client = this.sdk.client

    const successfullyMined = (randomness: number, miningRequestId: number) => {
      cli.action.stop(
        `Submitting mining attempt to node from request ${miningRequestId} with randomness ${randomness}`,
      )

      const request = client.successfullyMined({ randomness, miningRequestId })
      request.waitForEnd().catch(() => {
        cli.action.stop('Unable to submit mined block')
      })

      cli.action.start('Mining a block')
    }

    async function* nextBlock(blocksStream: AsyncGenerator<unknown, void>) {
      for (;;) {
        const blocksResult =
          (await blocksStream.next()) as IteratorResult<NewBlocksStreamResponse>

        if (blocksResult.done) {
          return
        }

        yield blocksResult.value
      }
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const connected = await client.tryConnect()

      if (!connected) {
        this.logger.log('Not connected to a node - waiting 5s before retrying')
        await PromiseUtils.sleep(5000)
        continue
      }

      this.logger.log(`Starting to mine with ${threads} thread${threads === 1 ? '' : 's'}`)
      const blocksStream = client.newBlocksStream().contentStream()

      cli.action.start('Mining a block')
      const miner = new IronfishMiner(threads)
      await miner.mine(nextBlock(blocksStream), successfullyMined)
      cli.action.stop('Mining interrupted')
    }
  }
}
