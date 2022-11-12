/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  createRootLogger,
  FileUtils,
  isValidPublicAddress,
  MiningStatusMessage,
  parseUrl,
  PromiseUtils,
  StratumClient,
  waitForEmit,
} from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import blessed from 'blessed'
import { table } from 'table'
import { TableUserConfig } from 'table'
import dns from 'dns'
import { IronfishCommand } from '../../../command'

export class PoolStatus extends IronfishCommand {
  static description = `Show the status of a mining pool`

  static flags = {
    address: Flags.string({
      char: 'a',
      description: 'The public address for which to retrieve pool share data',
    }),
    pool: Flags.string({
      char: 'p',
      description: 'The host and port of the mining pool to connect to',
    }),
    follow: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Follow the status of the mining pool',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(PoolStatus)

    if (flags.address && !isValidPublicAddress(flags.address)) {
      this.error('The given public address is not valid, please provide a valid one.')
    }

    let host: string = this.sdk.config.get('poolHost')
    let port: number = this.sdk.config.get('poolPort')
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

    const stratum = new StratumClient({
      host: host,
      port: port,
      logger: createRootLogger(),
    })

    if (!flags.follow) {
      stratum.onConnected.on(() => stratum.getStatus(flags.address))
      stratum.onStatus.on((status) => this.log(this.renderStatus(status)))
      stratum.start()
      await waitForEmit(stratum.onStatus)
      this.exit(0)
    }

    this.logger.pauseLogs()

    const screen = blessed.screen({ smartCSR: true })
    const statusText = blessed.text()
    screen.append(statusText)

    stratum.onStatus.on((status) => {
      statusText.setContent(this.renderStatus(status))
      screen.render()
    })
    stratum.start()

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (!stratum.isConnected()) {
        statusText.setContent(`Not connected to pool ${host}:${port}`)
        screen.render()
        await PromiseUtils.sleep(1000)
        continue
      }

      stratum.getStatus(flags.address)
      await waitForEmit(stratum.onStatus)
      await PromiseUtils.sleep(5000)
    }
  }

  renderStatus(status: MiningStatusMessage): string {
    const output = []
    let result = []
    result.push(['Status of mining pool', `${status.name}`])
    result.push(['Miners', `${status.clients}`])
    result.push(['Hashrate', `${FileUtils.formatHashRate(status.hashRate)}`])
    result.push(['Shares pending payout', `${status.sharesPending}`])
    result.push(['Clients', `${status.clients}`])
    result.push(['Bans', `${status.bans}`])
    output.push(table(result))

    if (status.addressStatus) {
      result = []
      result.push(['Mining status for address', `${status.addressStatus.publicAddress}`])
      result.push(['Number of miners', `${status.addressStatus.miners}`])
      result.push(['Connected miners', `${status.addressStatus.connectedMiners.join(', ')}`])
      result.push(['Hashrate', `${FileUtils.formatHashRate(status.addressStatus.hashRate)}`])
      result.push(['Shares pending payout', `${status.addressStatus.sharesPending}`])
      output.push(table(result))
    }

    return output.join('\n')
  }
}
