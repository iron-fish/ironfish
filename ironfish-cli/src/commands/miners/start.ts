/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { flags } from '@oclif/command'
import cli from 'cli-ux'
import {
  AsyncUtils,
  Miner as IronfishMiner,
  MineRequest,
  NewBlocksStreamResponse,
  PromiseUtils,
} from 'ironfish'
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

    if (flags.threads === 0 || flags.threads < -1) {
      throw new Error('--threads must be a positive integer or -1.')
    }

    if (flags.threads === -1) {
      flags.threads = os.cpus().length
    }

    const client = this.sdk.client
    const miner = new IronfishMiner(flags.threads)

    const successfullyMined = (request: MineRequest, randomness: number) => {
      this.log(
        `Submitting hash for block ${request.sequence} on request ${request.miningRequestId} (${randomness})`,
      )

      const response = client.successfullyMined({
        randomness,
        miningRequestId: request.miningRequestId,
      })

      response.waitForEnd().catch(() => {
        this.log('Unable to submit mined block')
      })
    }

    const updateHashPower = () => {
      cli.action.status = `${Math.max(0, Math.floor(miner.hashRate.rate5s))} H/s`
    }

    const onStartMine = (request: MineRequest) => {
      cli.action.start(`Mining block ${request.sequence} on request ${request.miningRequestId}`)
      updateHashPower()
    }

    const onStopMine = () => {
      cli.action.start('Waiting for next block')
      updateHashPower()
    }

    async function* nextBlock(blocksStream: AsyncGenerator<MineRequest, void, void>) {
      for (;;) {
        const blocksResult = await blocksStream.next()

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

      this.logger.log(
        `Starting to mine with ${flags.threads} thread${flags.threads === 1 ? '' : 's'}`,
      )

      const blocksStream = client.newBlocksStream().contentStream()

      // We do this to tranform the JSON bytes back to a buffer
      const transformed = AsyncUtils.transform<NewBlocksStreamResponse, MineRequest>(
        blocksStream,
        (value) => ({ ...value, bytes: Buffer.from(value.bytes.data) }),
      )

      cli.action.start('Waiting for director to send work.')

      const hashPowerInterval = setInterval(updateHashPower, 1000)

      miner.onStartMine.on(onStartMine)
      miner.onStopMine.on(onStopMine)

      await miner.mine(nextBlock(transformed), successfullyMined)

      clearInterval(hashPowerInterval)
    }
  }
}
