/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Axios, { AxiosInstance } from 'axios'
import { createRootLogger, Logger } from '../../logger'
import { displayIronAmountWithCurrency, ErrorUtils, oreToIron } from '../../utils'
import { FileUtils } from '../../utils/file'

export abstract class WebhookNotifier {
  protected readonly webhook: string | null = null
  protected readonly client: AxiosInstance | null = null
  protected readonly logger: Logger
  protected readonly explorerBlocksUrl: string | null = null
  protected readonly explorerTransactionsUrl: string | null = null

  constructor(options: {
    webhook: string | null
    logger?: Logger
    explorerBlocksUrl?: string | null
    explorerTransactionsUrl?: string | null
  }) {
    this.logger = options.logger ?? createRootLogger()
    this.explorerBlocksUrl = options.explorerBlocksUrl ?? null
    this.explorerTransactionsUrl = options.explorerTransactionsUrl ?? null

    if (options.webhook) {
      this.webhook = options.webhook
      this.client = Axios.create()
    }
  }

  abstract sendText(text: string): void

  poolConnected(): void {
    this.sendText('Successfully connected to node')
  }

  poolDisconnected(): void {
    this.sendText('Disconnected from node unexpectedly. Reconnecting.')
  }

  poolSubmittedBlock(hashedHeaderHex: string, hashRate: number, clients: number): void {
    this.sendText(
      `Block ${this.renderHashHex(
        hashedHeaderHex,
        this.explorerBlocksUrl,
      )} submitted successfully! ${FileUtils.formatHashRate(
        hashRate,
      )}/s with ${clients} miners`,
    )
  }

  poolPayoutSuccess(
    payoutId: number,
    transactionHashHex: string,
    receives: { publicAddress: string; amount: string; memo: string }[],
    totalShareCount: number,
  ): void {
    const total = receives.reduce((m, c) => BigInt(c.amount) + m, BigInt(0))

    this.sendText(
      `Successfully created payout of ${totalShareCount} shares to ${
        receives.length
      } users for ${displayIronAmountWithCurrency(
        Number(oreToIron(Number(total.toString()))),
        false,
      )} in transaction ${this.renderHashHex(
        transactionHashHex,
        this.explorerTransactionsUrl,
      )}. Transaction pending (${payoutId})`,
    )
  }

  poolPayoutError(error: unknown): void {
    this.sendText(
      `Error while sending payout transaction: ${ErrorUtils.renderError(error, true)}`,
    )
  }

  poolPayoutStarted(
    payoutId: number,
    receives: { publicAddress: string; amount: string; memo: string }[],
    totalShareCount: number,
  ): void {
    const total = receives.reduce((m, c) => BigInt(c.amount) + m, BigInt(0))

    this.sendText(
      `Creating payout of ${totalShareCount} shares to ${
        receives.length
      } users for ${displayIronAmountWithCurrency(
        Number(oreToIron(Number(total.toString()))),
        false,
      )}(${payoutId})`,
    )
  }

  poolStatus(status: {
    name: string
    hashRate: number
    miners: number
    sharesPending: number
    bans: number
    clients: number
  }): void {
    this.sendText(
      `Status for mining pool '${status.name}':\n\tHashrate: ${FileUtils.formatHashRate(
        status.hashRate,
      )}/s\n\tMiners: ${status.miners}\n\tShares pending: ${status.sharesPending}\n\tClients: ${
        status.clients
      }\n\tBans: ${status.bans}`,
    )
  }

  private renderHashHex(hashHex: string, explorerUrl: string | null): string {
    if (explorerUrl == null) {
      return `\`${hashHex}\``
    }

    return `${explorerUrl + hashHex}`
  }
}
