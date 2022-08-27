/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { displayIronToOreRate, ironToOre, RpcClient, WebApi } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { RemoteFlags } from '../flags'
import { ProgressBar } from '../types'
import { Pay } from './accounts/pay'

export default class Bank extends Pay {
  static description = 'Deposit $IRON for testnet points'
  ORE_TO_SEND = 10000000

  async start(): Promise<void> {
    const { flags } = await this.parse(Bank)
    const api = new WebApi()

    this.fromAccount = flags.account
    this.toAddress = await api.getDepositAddress()
    this.amountInOre = this.ORE_TO_SEND
    this.feeInOre = flags.fee
    this.expirationSequence = flags.expirationSequence
    this.memo = flags.memo || ''

    this.client = await this.sdk.connectRpc(false, true)

    if (!this.fromAccount) {
      this.fromAccount = await this.getFromAccountFromPrompt()
    }

    if (!this.toAddress) {
      this.log('Error accessing the Ironfish API. Please try again later.')
      this.exit(1)
    }

    if (!this.feeInOre) {
      this.feeInOre = await this.getFeeFromPrompt()
    }

    const balanceResponse = await this.client.getAccountBalance({ account: this.fromAccount })
    const balance = balanceResponse.content.confirmed
      ? Number(balanceResponse.content.confirmed)
      : 0

    await this.validate(balance, !flags.isConfirmed)
    await this.processSend()
  }
}
