/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  FileUtils,
  isValidPublicAddress,
  MiningStatusMessage,
  parseUrl,
  PromiseUtils,
  StratumClient,
  StratumTcpClient,
  StratumTlsClient,
  waitForEmit,
} from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import blessed from 'blessed'
import dns from 'dns'
import { IronfishCommand } from '../../../command'
import { JsonFlags } from '../../../flags'
import * as ui from '../../../ui'

export class PoolStatus extends IronfishCommand {
  static description = `show the mining pool's status`
  static enableJsonFlag = true

  static flags = {
    ...JsonFlags,
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
    tls: Flags.boolean({
      description: 'Connect to pool over tls',
      allowNo: true,
    }),
  }

  async start(): Promise<unknown> {
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

    let stratum: StratumClient
    if (flags.tls) {
      stratum = new StratumTlsClient({ host, port, logger: this.logger })
    } else {
      stratum = new StratumTcpClient({ host, port, logger: this.logger })
    }

    if (!flags.follow) {
      let poolStatus
      stratum.onConnected.on(() => stratum.getStatus(flags.address))
      stratum.onStatus.on((status) => {
        this.log(this.renderStatus(status))
        poolStatus = status
      })
      stratum.start()
      await waitForEmit(stratum.onStatus)
      stratum.stop()

      return poolStatus
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
    let data: Record<string, unknown> = {
      'Status of mining pool': status.name,
      Miners: status.miners,
      Hashrate: FileUtils.formatHashRate(status.hashRate),
      'Shares pending payout': status.sharesPending,
      Clients: status.clients,
      Bans: status.bans,
    }

    if (status.addressStatus) {
      data = {
        ...data,
        'Mining status for address': status.addressStatus.publicAddress,
        'Number of miners': status.addressStatus.miners,
        'Connected miners': status.addressStatus.connectedMiners.join(', '),
        Hashrate: FileUtils.formatHashRate(status.addressStatus.hashRate),
        'Shares pending payout': status.addressStatus.sharesPending,
      }
    }

    return ui.card(data)
  }
}
