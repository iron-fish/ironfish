/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PromiseUtils, WebApi } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { Pay } from './accounts/pay'

export default class Bank extends Pay {
  static description = 'Deposit $IRON for testnet points'
  ORE_TO_SEND = 10000000

  static flags = {
    ...Pay.flags,
    loop: Flags.boolean({
      char: 'l',
      description: 'deposit on loop',
      default: false,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Bank)
    const api = new WebApi()

    let fromAccount = flags.account
    const toAddress = await api.getDepositAddress()
    const amountInOre = this.ORE_TO_SEND
    let feeInOre = flags.fee
    const expirationSequence = flags.expirationSequence
    const memo = flags.memo || ''
    const depositAll = flags.loop

    const client = await this.sdk.connectRpc(false, true)

    if (!fromAccount) {
      fromAccount = await this.getFromAccountFromPrompt(client)
    }

    if (!toAddress) {
      this.log('Error accessing the Ironfish API. Please try again later.')
      this.exit(1)
    }

    if (!feeInOre) {
      feeInOre = await this.getFeeFromPrompt(client)
    }

    let processNext = true
    if (processNext) {
      const balanceResponse = await client.getAccountBalance({ account: fromAccount })
      const balance = balanceResponse.content.confirmed
        ? Number(balanceResponse.content.confirmed)
        : 0

      await this.validate(
        fromAccount,
        toAddress,
        amountInOre,
        feeInOre,
        expirationSequence,
        balance,
        !flags.confirm,
      )
      await this.processSend(
        fromAccount,
        toAddress,
        amountInOre,
        feeInOre,
        expirationSequence,
        memo,
        client,
      )
      if (depositAll && Number(balanceResponse.content.unconfirmed) >= amountInOre * 2) {
        await PromiseUtils.sleep(30)
      } else {
        processNext = false
      }
    }
  }
}
