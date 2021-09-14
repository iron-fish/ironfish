/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { flags } from '@oclif/command'
import cli from 'cli-ux'
import {
  AsyncUtils,
  IronfishRpcClient,
  Miner as IronfishMiner,
  MinerFoo,
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
    workers: flags.integer({
      char: 't',
      default: 1,
      description: 'number of workers to use for mining. -1 will use ALL your available cores.',
    }),
    name: flags.string({
      char: 'n',
      description: 'An identifiable name of the miner',
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
    let connectAttempts = 0

    this.log(
      `Starting miner${flags.name ? ' ' + flags.name : ''} with ${flags.workers} worker(s)`,
    )

    cli.action.start('Starting miner')

    // eslint-disable-next-line no-constant-condition
    while (true) {
      cli.action.start('Connecting to node')
      const connected = await client.tryConnect()

      if (!connected) {
        cli.action.start(
          'Not connected to a node - waiting 5s before retrying' +
            (connectAttempts ? `(attempts ${connectAttempts})` : ''),
        )

        connectAttempts++
        await PromiseUtils.sleep(5000)
        continue
      }

      connectAttempts = 0
      cli.action.start('Connecting miner')

      const stream = client.connectMinerStream({ name: flags.name })
      const info = await AsyncUtils.first(stream.contentStream())

      this.log(`Miner connected with id ${String(info.minerId)}`)
      const miner = new MinerFoo()

      cli.action.start('Authenticating miner')

      const onRequestWork = async (): Promise<void> => {
        this.log('Requesting Work\n')
        await client.getMinerWork({ id: info.minerId, token: info.token })
      }

      miner.onRequestWork.on(onRequestWork)

      await stream.waitForEnd()
    }
  }
}
