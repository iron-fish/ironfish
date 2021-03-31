/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import cli from 'cli-ux'
import { miner, NewBlocksStreamResponse, PromiseUtils } from 'ironfish'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class Miner extends IronfishCommand {
  static description = `Start a miner and subscribe to new blocks for the node`

  static flags = {
    ...RemoteFlags,
  }

  async start(): Promise<void> {
    this.parse(Miner)

    const client = this.sdk.client

    const successfullyMined = (randomness: number, miningRequestId: number) => {
      cli.action.stop(
        `Successfully mined a block on request ${miningRequestId} randomness ${randomness}`,
      )
      const request = client.successfullyMined({ randomness, miningRequestId })
      request.waitForEnd().catch(() => {
        cli.action.stop('Unable to submit mined block')
      })

      cli.action.start('Mining a block')
    }

    async function* nextBlock(blocksStream: AsyncGenerator<unknown, void>) {
      for (;;) {
        const blocksResult = (await blocksStream.next()) as IteratorResult<
          NewBlocksStreamResponse
        >

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

      this.logger.log('Starting to mine')
      const blocksStream = client.newBlocksStream().contentStream()

      cli.action.start('Mining a block')
      await miner(nextBlock(blocksStream), successfullyMined)
      cli.action.stop('Mining interrupted')
    }
  }
}
