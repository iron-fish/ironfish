/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  DEFAULT_POOL_PORT,
  GraffitiUtils,
  isValidPublicAddress,
  MiningPoolMiner,
  MiningSoloMiner,
} from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import dns from 'dns'
import os from 'os'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class Miner extends IronfishCommand {
  static description = `Start a miner and subscribe to new blocks for the node`

  static flags = {
    ...RemoteFlags,
    threads: Flags.integer({
      char: 't',
      default: -1,
      description:
        'number of CPU threads to use for mining. -1 will auto-detect based on number of CPU cores.',
    }),
    pool: Flags.string({
      char: 'p',
      description: 'the host of the mining pool to connect to such as 92.191.17.232',
    }),
    poolPort: Flags.integer({
      char: 'o',
      default: DEFAULT_POOL_PORT,
      description: 'the port of the mining pool to connect to such as 9034',
    }),
    address: Flags.string({
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
      if (flags.address == null) {
        this.error(
          "Can't mine from a pool without a public address. Use `-a address-goes-here` to provide one.",
        )
      }

      if (!isValidPublicAddress(flags.address)) {
        this.error('The given public address is not valid, please provide a valid one.')
      }

      this.log(`Staring to mine with public address: ${flags.address} at pool ${flags.pool}`)

      const poolHost = (await dns.promises.lookup(flags.pool)).address
      const port = flags.poolPort ?? DEFAULT_POOL_PORT

      const miner = new MiningPoolMiner({
        threadCount: flags.threads,
        publicAddress: flags.address,
        batchSize,
        host: poolHost,
        port: port,
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
