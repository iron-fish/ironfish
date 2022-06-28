/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  DEFAULT_POOL_HOST,
  DEFAULT_POOL_PORT,
  Discord,
  Lark,
  MiningPool,
  parseUrl,
  StringUtils,
  WebhookNotifier,
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
    lark: Flags.string({
      char: 'l',
      description: 'a lark webhook URL to send critical information to',
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
    balancePercentPayout: Flags.integer({
      description: 'whether the pool should payout or not. useful for solo miners',
    }),
    banning: Flags.boolean({
      description: 'whether the pool should ban peers for errors or bad behavior',
      allowNo: true,
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

    const webhooks: WebhookNotifier[] = []

    const discordWebhook = flags.discord ?? this.sdk.config.get('poolDiscordWebhook')
    if (discordWebhook) {
      webhooks.push(
        new Discord({
          webhook: discordWebhook,
          logger: this.logger,
          explorerBlocksUrl: this.sdk.config.get('explorerBlocksUrl'),
          explorerTransactionsUrl: this.sdk.config.get('explorerTransactionsUrl'),
        }),
      )

      this.log(`Discord enabled: ${discordWebhook}`)
    }

    const larkWebhook = flags.lark ?? this.sdk.config.get('poolLarkWebhook')
    if (larkWebhook) {
      webhooks.push(
        new Lark({
          webhook: larkWebhook,
          logger: this.logger,
          explorerBlocksUrl: this.sdk.config.get('explorerBlocksUrl'),
          explorerTransactionsUrl: this.sdk.config.get('explorerTransactionsUrl'),
        }),
      )

      this.log(`Lark enabled: ${larkWebhook}`)
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
      logger: this.logger,
      rpc,
      enablePayouts: flags.payouts,
      webhooks: webhooks,
      host: host,
      port: port,
      balancePercentPayoutFlag: flags.balancePercentPayout,
      banning: flags.banning,
    })

    await this.pool.start()
    await this.pool.waitForStop()
  }

  async closeFromSignal(): Promise<void> {
    await this.pool?.stop()
  }
}
