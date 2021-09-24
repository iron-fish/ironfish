/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { flags } from '@oclif/command'
import cli from 'cli-ux'
import { IronfishRpcClient, Miner as IronfishMiner, NewBlocksStreamResponse, PromiseUtils } from 'ironfish'
import os from 'os'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class Miner extends IronfishCommand {
  static description = `Start a miner and subscribe to new blocks for the node`

  static flags = {
    ...RemoteFlags,
    workers: flags.integer({
      char: 't',
      default: 1,
      description: 'number of workers to use for mining. -1 will use ALL your available cores.',
    }),
  }

  async start(): Promise<void> {
    const { flags } = this.parse(Miner)

    if (flags.workers === 0 || flags.workers < -1) {
      throw new Error('--workers must be a positive integer or -1.')
    }

    if (flags.workers === -1) {
      flags.workers = os.cpus().length - 1
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

      this.logger.log(`Starting to mine with ${flags.workers} worker(s)`)

      const blocksStream = client.newBlocksStream().contentStream()

      cli.action.start('Mining a block')
      const miner = new IronfishMiner({ workers: flags.workers })
      // await miner.mine(nextBlock(blocksStream), successfullyMined)
      cli.action.stop('Mining interrupted')
    }
  }
}
