/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  FileUtils,
  GraffitiUtils,
  isValidPublicAddress,
  MiningPoolMiner,
  MiningSoloMiner,
  parseUrl,
  SetIntervalToken,
} from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import dns from 'dns'
import os from 'os'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class Miner extends IronfishCommand {
  static description = `Start a miner and subscribe to new blocks for the node`

  updateInterval: SetIntervalToken | null = null

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
      description: 'the host and port of the mining pool to connect to such as 92.191.17.232',
    }),
    address: Flags.string({
      char: 'a',
      description: 'the public address to receive pool payouts',
    }),
    richOutput: Flags.boolean({
      default: true,
      allowNo: true,
      description: 'enable fancy hashpower display',
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

      let host = this.sdk.config.get('poolHost')
      let port = this.sdk.config.get('poolPort')

      if (flags.pool) {
        const parsed = parseUrl(flags.pool)

        if (parsed.hostname) {
          const resolved = await dns.promises.lookup(parsed.hostname)
          host = resolved.address
        }

        if (parsed.port) {
          port = parsed.port
        }
      }

      this.log(`Starting to mine with public address: ${flags.address} at pool ${host}:${port}`)

      const miner = new MiningPoolMiner({
        threadCount: flags.threads,
        publicAddress: flags.address,
        logger: this.logger,
        batchSize,
        host: host,
        port: port,
      })

      miner.start()

      if (flags.richOutput) {
        this.displayHashrate(miner)
      }

      await miner.waitForStop()

      if (this.updateInterval) {
        clearInterval(this.updateInterval)
      }
    }

    if (!flags.pool) {
      this.log(`Starting to mine with graffiti: ${graffiti}`)

      const rpc = this.sdk.client

      const miner = new MiningSoloMiner({
        threadCount: flags.threads,
        graffiti: GraffitiUtils.fromString(graffiti),
        logger: this.logger,
        batchSize,
        rpc,
      })

      miner.start()

      if (flags.richOutput) {
        this.displayHashrate(miner)
      }

      await miner.waitForStop()

      if (this.updateInterval) {
        clearInterval(this.updateInterval)
      }
    }
  }

  displayHashrate(miner: MiningPoolMiner | MiningSoloMiner): void {
    CliUx.ux.action.start(`Hashrate`)

    const updateHashPower = () => {
      const rate = Math.max(0, Math.floor(miner.hashRate.rate5s))
      const formatted = `${FileUtils.formatHashRate(rate)}/s (${rate})`
      CliUx.ux.action.status = formatted
    }

    this.updateInterval = setInterval(updateHashPower, 1000)
  }
}
