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
  StratumTcpClient,
  StratumTlsClient,
} from '@ironfish/sdk'
import { Flags, ux } from '@oclif/core'
import dns from 'dns'
import os from 'os'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class Miner extends IronfishCommand {
  static description = `start a miner`

  updateInterval: SetIntervalToken | null = null

  static flags = {
    ...RemoteFlags,
    threads: Flags.integer({
      char: 't',
      default: 1,
      description:
        'Number of CPU threads to use for mining. -1 will auto-detect based on number of CPU cores.',
    }),
    pool: Flags.string({
      char: 'p',
      description: 'The host and port of the mining pool to connect to such as 92.191.17.232',
    }),
    name: Flags.string({
      char: 'n',
      description: 'The miner name distinguishes different miners',
    }),
    address: Flags.string({
      char: 'a',
      description: 'The public address to receive pool payouts',
    }),
    richOutput: Flags.boolean({
      default: true,
      allowNo: true,
      description: 'Enable fancy hashpower display',
    }),
    tls: Flags.boolean({
      description: 'Connect to pool over tls',
      allowNo: true,
    }),
    fishHashFull: Flags.boolean({
      description: 'Instantiate the full 4.6GB fish hash context in every thread',
      default: false,
      allowNo: true,
    }),
    blake3: Flags.boolean({
      description: 'Mine with the blake3 algorithm instead of fish hash',
      default: false,
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
      let publicAddress = flags.address

      if (publicAddress == null) {
        const client = await this.connectRpc()
        const publicKeyResponse = await client.wallet.getAccountPublicKey()

        publicAddress = publicKeyResponse.content.publicKey
      }

      if (!isValidPublicAddress(publicAddress)) {
        this.error(
          `The given public address is not valid, please provide a valid one: ${publicAddress}`,
        )
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

      const nameInfo = flags.name ? ` with name ${flags.name}` : ''
      this.log(
        `Starting to mine with public address: ${publicAddress} at pool ${host}:${port}${nameInfo}`,
      )

      let stratum
      if (flags.tls) {
        stratum = new StratumTlsClient({ host, port, logger: this.logger })
      } else {
        stratum = new StratumTcpClient({ host, port, logger: this.logger })
      }

      const miner = new MiningPoolMiner({
        threadCount: flags.threads,
        publicAddress,
        logger: this.logger,
        batchSize,
        stratum,
        name: flags.name,
        blake3: flags.blake3,
        fishHashFullContext: flags.fishHashFull,
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
        fishHashFullContext: flags.fishHashFull,
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
    ux.action.start(`Hashrate`)

    const updateHashPower = () => {
      const rate = Math.max(0, Math.floor(miner.hashRate.rate5s))
      const formatted = `${FileUtils.formatHashRate(rate)}/s (${rate})`
      ux.action.status = formatted
    }

    this.updateInterval = setInterval(updateHashPower, 1000)
  }
}
