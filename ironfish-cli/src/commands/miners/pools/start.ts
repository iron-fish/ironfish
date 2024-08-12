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
  TlsUtils,
  WebhookNotifier,
} from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import dns from 'dns'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import { getExplorer } from '../../../utils/explorer'

export class StartPool extends IronfishCommand {
  static description = `start a mining pool`

  static flags = {
    ...RemoteFlags,
    discord: Flags.string({
      description: 'A discord webhook URL to send critical information to',
    }),
    lark: Flags.string({
      char: 'l',
      description: 'A lark webhook URL to send critical information to',
    }),
    host: Flags.string({
      char: 'h',
      description: `A host:port listen for stratum connections: ${DEFAULT_POOL_HOST}:${String(
        DEFAULT_POOL_PORT,
      )}`,
    }),
    payouts: Flags.boolean({
      default: true,
      allowNo: true,
      description: 'Whether the pool should payout or not. Useful for solo miners',
    }),
    banning: Flags.boolean({
      description: 'Whether the pool should ban peers for errors or bad behavior',
      allowNo: true,
    }),
    tls: Flags.boolean({
      description: 'Whether the pool should listen for connections over tls',
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

    if (!host) {
      host = this.sdk.config.get('poolHost')
    }

    if (!port) {
      port = this.sdk.config.get('poolPort')
    }

    let tlsOptions = undefined
    if (flags.tls) {
      const fileSystem = this.sdk.fileSystem
      const nodeKeyPath = this.sdk.config.get('tlsKeyPath')
      const nodeCertPath = this.sdk.config.get('tlsCertPath')
      tlsOptions = await TlsUtils.getTlsOptions(
        fileSystem,
        nodeKeyPath,
        nodeCertPath,
        this.logger,
      )
    }

    this.pool = await MiningPool.init({
      config: this.sdk.config,
      logger: this.logger,
      rpc,
      enablePayouts: flags.payouts,
      webhooks: webhooks,
      host: host,
      port: port,
      banning: flags.banning,
      tls: flags.tls,
      tlsOptions: tlsOptions,
      getExplorer,
    })

    await this.pool.start()
    await this.pool.waitForStop()
  }

  async closeFromSignal(): Promise<void> {
    await this.pool?.stop()
  }
}
