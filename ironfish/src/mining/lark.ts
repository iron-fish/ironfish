/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Axios, { AxiosInstance } from 'axios'
import { createRootLogger, Logger } from '../logger'
import { displayIronAmountWithCurrency, ErrorUtils, oreToIron } from '../utils'
import { FileUtils } from '../utils/file'

export class Lark {
  private readonly webhook: string | null = null
  private readonly client: AxiosInstance | null = null
  private readonly logger: Logger

  constructor(options: { webhook: string | null; logger?: Logger }) {
    this.logger = options.logger ?? createRootLogger()

    if (options.webhook) {
      this.webhook = options.webhook
      this.client = Axios.create()
    }
  }

  sendText(text: string): void {
    if (!this.client || !this.webhook) {
      return
    }

    this.client.post(this.webhook, { msg_type: 'text', content: { text: text } }).catch((e) => {
      this.logger.error('Error sending lark message', e)
    })
  }

  poolConnected(): void {
    this.sendText('Successfully connected to node')
  }

  poolDisconnected(): void {
    this.sendText('Disconnected from node unexpectedly. Reconnecting.')
  }

  poolSubmittedBlock(hash: Buffer, hashRate: number, clients: number): void {
    this.sendText(
      `Block \`${hash.toString('hex')}\` submitted successfully! ${FileUtils.formatHashRate(
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
      `Successfully paid out ${totalShareCount} shares to ${
        receives.length
      } users for ${displayIronAmountWithCurrency(
        Number(oreToIron(Number(total.toString()))),
        false,
      )} in transaction \`${transactionHashHex}\` (${payoutId})`,
    )
  }

  poolPayoutError(error: unknown): void {
    this.sendText(
      `Error while sending payout transaction: ${ErrorUtils.renderError(error, true)}`,
    )
  }
}
