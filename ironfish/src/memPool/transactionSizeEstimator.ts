/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Transaction } from '@ironfish/rust-nodejs'
import { createRootLogger, Logger } from '../logger'
import { getTransactionSize } from '../network/utils/serializers'
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

  async estimateTransactionSize(
    sender: Account,
    receives: { publicAddress: string; amount: bigint; memo: string }[],
    defaultTransactionExpirationSequenceDelta: number,
    expirationSequence?: number | null,
    estimateFeeRate?: bigint,
  ): Promise<number> {
    const heaviestHead = this.wallet.chain.head
    if (heaviestHead === null) {
      throw new Error('You must have a genesis block to estimate a transaction size')
    }

    expirationSequence =
      expirationSequence ?? heaviestHead.sequence + defaultTransactionExpirationSequenceDelta

    const transaction = new Transaction(sender.spendingKey)
    transaction.setExpirationSequence(expirationSequence)

    let amountNeeded = receives.reduce((acc, receive) => acc + receive.amount, BigInt(0))

    const { amount, notesToSpend } = await this.wallet.createSpends(sender, amountNeeded)

    if (amount < amountNeeded) {
      throw new NotEnoughFundsError(
        `Insufficient funds: Needed ${amountNeeded.toString()} but have ${amount.toString()}`,
      )
    }

    const spendsLength = notesToSpend.length * SPEND_SERIALIZED_SIZE_IN_BYTE_PERCENTILES

    const notesLength = receives.length * NOTE_SERIALIZED_SIZE_IN_BYTE_PERCENTILES

    let transactionSize =
      getTransactionSize(transaction.serialize()) + spendsLength + notesLength

    if (estimateFeeRate) {
      amountNeeded += estimateFeeRate * BigInt(Math.ceil(transactionSize / 1000))
      const { notesToSpend: newNotesToSpend } = await this.wallet.createSpends(
        sender,
        amountNeeded,
      )
      const additionalSpendsLength =
        (newNotesToSpend.length - notesToSpend.length) *
        SPEND_SERIALIZED_SIZE_IN_BYTE_PERCENTILES
      transactionSize += additionalSpendsLength
    }

    return Math.ceil(transactionSize / 1000)
  }
}
