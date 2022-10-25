/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRootLogger, Logger } from '../logger'
import { Wallet } from '../wallet'
import { Account } from '../wallet/account'
import { NotEnoughFundsError } from '../wallet/errors'

const SPEND_SERIALIZED_SIZE_IN_BYTE_PERCENTILES = 388
const NOTE_SERIALIZED_SIZE_IN_BYTE_PERCENTILES = 467

export class TransactionSizeEstimator {
  private wallet: Wallet
  private readonly logger: Logger

  constructor(options: { wallet: Wallet; logger?: Logger }) {
    this.logger = options.logger || createRootLogger().withTag('recentFeeCache')
    this.wallet = options.wallet
  }

  async getPendingTransactionSize(
    sender: Account,
    receives: { publicAddress: string; amount: bigint; memo: string }[],
    estimateFeeRate?: bigint,
  ): Promise<number> {
    let size = 0
    size += 8 // spends length
    size += 8 // notes length
    size += 8 // fee
    size += 4 // expiration
    size += 64 // signature

    let amountNeeded = receives.reduce((acc, receive) => acc + receive.amount, BigInt(0))

    const { amount, notesToSpend } = await this.wallet.createSpends(sender, amountNeeded)

    if (amount < amountNeeded) {
      throw new NotEnoughFundsError(
        `Insufficient funds: Needed ${amountNeeded.toString()} but have ${amount.toString()}`,
      )
    }

    size += notesToSpend.length * SPEND_SERIALIZED_SIZE_IN_BYTE_PERCENTILES

    size += receives.length * NOTE_SERIALIZED_SIZE_IN_BYTE_PERCENTILES

    if (estimateFeeRate) {
      amountNeeded += estimateFeeRate * BigInt(Math.ceil(size / 1000))
      const { notesToSpend: newNotesToSpend } = await this.wallet.createSpends(
        sender,
        amountNeeded,
      )
      const additionalSpendsLength =
        (newNotesToSpend.length - notesToSpend.length) *
        SPEND_SERIALIZED_SIZE_IN_BYTE_PERCENTILES
      size += additionalSpendsLength
    }

    return Math.ceil(size / 1000)
  }
}
