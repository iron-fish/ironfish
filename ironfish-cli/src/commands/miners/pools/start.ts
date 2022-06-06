/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  DEFAULT_POOL_HOST,
  DEFAULT_POOL_PORT,
  Discord,
  MiningPool,
  parseUrl,
  StringUtils,
} from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import dns from 'dns'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'

export class StartPool extends IronfishCommand {
  static description = `Start a mining pool that connects to a node`

  static flags = {
    ...RemoteFlags,
    discord: Flags.string({
      char: 'd',
      description: 'a discord webhook URL to send critical information to',
    }),
    host: Flags.string({
      char: 'h',
      description: `a host:port listen for stratum connections: ${DEFAULT_POOL_HOST}:${String(
        DEFAULT_POOL_PORT,
      )}`,
    }),
    payouts: Flags.boolean({
      default: true,
      allowNo: true,
      description: 'whether the pool should payout or not. useful for solo miners',
    }),
  }

  pool: MiningPool | null = null

  async start(): Promise<void> {
    const { flags } = await this.parse(StartPool)

    const poolName = this.sdk.config.get('poolName')
    const nameByteLen = StringUtils.getByteLength(poolName)
    if (nameByteLen > 18) {
      this.warn(`The provided name ${poolName} has a byte length of ${nameByteLen}`)
      this.warn(
        'It is recommended to keep the pool name below 18 bytes in length to avoid possible work duplication issues',
      )
    }

    const rpc = this.sdk.client

    this.log(`Starting pool with name ${poolName}`)

    let discord: Discord | undefined = undefined

    const discordWebhook = flags.discord ?? this.sdk.config.get('poolDiscordWebhook')
    if (discordWebhook) {
      discord = new Discord({
        webhook: discordWebhook,
        logger: this.logger,
      })

      this.log(`Discord enabled: ${discordWebhook}`)
    }

    let host = undefined
    let port = undefined

    if (flags.host) {
      const parsed = parseUrl(flags.host)

      if (parsed.hostname) {
        const resolved = await dns.promises.lookup(parsed.hostname)
        host = resolved.address
      }

      if (parsed.port) {
        port = parsed.port
      }
    }

    this.pool = await MiningPool.init({
      config: this.sdk.config,
      rpc,
      enablePayouts: flags.payouts,
      discord,
      host: host,
      port: port,
    })

    await this.pool.start()
    await this.pool.waitForStop()
  }

  async closeFromSignal(): Promise<void> {
    await this.pool?.stop()
  }
}
