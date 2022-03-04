/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
import { GraffitiUtils, MiningPoolMiner, MiningSoloMiner } from 'ironfish'
import { SocketAddress } from 'net'
import os from 'os'
import { off } from 'process'
import url from 'url'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class Miner extends IronfishCommand {
  static description = `Start a miner and subscribe to new blocks for the node`

  static flags = {
    ...RemoteFlags,
    threads: Flags.integer({
      char: 't',
      default: 1,
      description:
        'number of CPU threads to use for mining. -1 will auto-detect based on number of CPU cores.',
    }),
    pool: Flags.string({
      char: 'p',
      description: 'the host of the mining pool to connect to such as 92.191.17.232',
    }),
    publicAddress: Flags.string({
      char: 'a',
      description: 'the public address to receive pool payouts',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Miner)

    if (flags.threads === 0 || flags.threads < -1) {
      throw new Error('--threads must be a positive integer or -1.')
    }

    if (flags.threads === -1) {
      flags.threads = os.cpus().length
    }

    const graffiti = this.sdk.config.get('blockGraffiti')
    const batchSize = this.sdk.config.get('minerBatchSize')

    if (flags.pool) {
      if (flags.publicAddress == null) {
        this.error(
          "Can't mine from a pool without a public address. Use `-a address-goes-here` to provide one.",
        )
      }

      this.log(
        `Staring to mine with public address: ${flags.publicAddress} at pool ${flags.pool}`,
      )

      const { hostname, port } = new URL(flags.pool)

      const miner = new MiningPoolMiner({
        threadCount: flags.threads,
        publicAddress: flags.publicAddress,
        batchSize,
        host: hostname,
        port: Number(port),
      })

      miner.start()
      await miner.waitForStop()
    }

    if (!flags.pool) {
      this.log(`Starting to mine with graffiti: ${graffiti} connecting to node`)

      const rpc = this.sdk.client

      const miner = new MiningSoloMiner({
        threadCount: flags.threads,
        graffiti: GraffitiUtils.fromString(graffiti),
        batchSize,
        rpc,
      })

      miner.start()
      await miner.waitForStop()
    }
  }
}
