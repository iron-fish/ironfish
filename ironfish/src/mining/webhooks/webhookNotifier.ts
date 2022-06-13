/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Axios, { AxiosInstance } from 'axios'
import { createRootLogger, Logger } from '../../logger'
import { displayIronAmountWithCurrency, ErrorUtils, oreToIron } from '../../utils'
import { FileUtils } from '../../utils/file'

const BLOCK_EXPLORER_URL = 'https://explorer.ironfish.network'

export abstract class WebhookNotifier {
  protected readonly webhook: string | null = null
  protected readonly client: AxiosInstance | null = null
  protected readonly logger: Logger

  constructor(options: { webhook: string | null; logger?: Logger }) {
    this.logger = options.logger ?? createRootLogger()

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
    const blockUrl = [BLOCK_EXPLORER_URL, 'blocks', hashedHeaderHex].join('/')
    const blockLink = `[${hashedHeaderHex}](${blockUrl})`

    this.sendText(
      `Block ${blockLink} submitted successfully! ${FileUtils.formatHashRate(
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

    const transactionUrl = [BLOCK_EXPLORER_URL, 'transaction', transactionHashHex].join('/')
    const transactionLink = `[${transactionHashHex}](${transactionUrl})`

    this.sendText(
      `Successfully created payout of ${totalShareCount} shares to ${
        receives.length
      } users for ${displayIronAmountWithCurrency(
        Number(oreToIron(Number(total.toString()))),
        false,
      )} in transaction ${transactionLink}. Transaction pending (${payoutId})`,
    )
  }

  poolPayoutError(error: unknown): void {
    this.sendText(
      `Error while sending payout transaction: ${ErrorUtils.renderError(error, true)}`,
    )
  }
}
