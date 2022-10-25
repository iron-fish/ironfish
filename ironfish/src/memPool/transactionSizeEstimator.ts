/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Note, Transaction } from '@ironfish/rust-nodejs'
import { createRootLogger, Logger } from '../logger'
import { Witness } from '../merkletree'
import { NoteHasher } from '../merkletree/hasher'
import { getTransactionSize } from '../network/utils/serializers'
import { Wallet } from '../wallet'
import { Account } from '../wallet/account'
import { NotEnoughFundsError } from '../wallet/errors'

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
    transactionFee: bigint,
    defaultTransactionExpirationSequenceDelta: number,
    expirationSequence?: number | null,
  ): Promise<number> {
    const heaviestHead = this.wallet.chain.head
    if (heaviestHead === null) {
      throw new Error('You must have a genesis block to estimate a transaction size')
    }

    expirationSequence =
      expirationSequence ?? heaviestHead.sequence + defaultTransactionExpirationSequenceDelta

    const transaction = new Transaction(sender.spendingKey)
    transaction.setExpirationSequence(expirationSequence)

    const amountNeeded =
      receives.reduce((acc, receive) => acc + receive.amount, BigInt(0)) + transactionFee

    const { amount, notesToSpend } = await this.wallet.createSpends(sender, amountNeeded)

    if (amount < amountNeeded) {
      throw new NotEnoughFundsError(
        `Insufficient funds: Needed ${amountNeeded.toString()} but have ${amount.toString()}`,
      )
    }

    const spends = notesToSpend.map((n) => ({
      note: n.note,
      treeSize: n.witness.treeSize(),
      authPath: n.witness.authenticationPath,
      rootHash: n.witness.rootHash,
    }))

    for (const spend of spends) {
      const note = spend.note
      transaction.spend(
        note,
        new Witness(spend.treeSize, spend.rootHash, spend.authPath, new NoteHasher()),
      )
    }

    for (const { publicAddress, amount, memo } of receives) {
      const note = new Note(publicAddress, amount, memo)
      transaction.receive(note)
    }

    return getTransactionSize(transaction.serialize()) / 1000
  }
}
