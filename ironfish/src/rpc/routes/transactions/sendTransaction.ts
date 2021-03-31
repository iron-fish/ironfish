/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ApiNamespace, router } from '../router'
import * as yup from 'yup'
import { ValidationError } from '../../adapters/errors'

const LATEST_HEAVIEST_TIMESTAMP_AGO = 1000 * 60 * 20

export type SendTransactionRequest = {
  fromAccountName: string
  toPublicKey: string
  amount: string
  transactionFee: string
  memo: string
}
export type SendTransactionResponse = {
  fromAccountName: string
  toPublicKey: string
  amount: string
  transactionHash: string
}

export const SendTransactionRequestSchema: yup.ObjectSchema<SendTransactionRequest> = yup
  .object({
    fromAccountName: yup.string().defined(),
    toPublicKey: yup.string().defined(),
    amount: yup.string().defined(),
    transactionFee: yup.string().defined(),
    memo: yup.string().defined(),
  })
  .defined()

export const SendTransactionResponseSchema: yup.ObjectSchema<SendTransactionResponse> = yup
  .object({
    fromAccountName: yup.string().defined(),
    toPublicKey: yup.string().defined(),
    amount: yup.string().defined(),
    transactionHash: yup.string().defined(),
  })
  .defined()

router.register<typeof SendTransactionRequestSchema, SendTransactionResponse>(
  `${ApiNamespace.transaction}/sendTransaction`,
  SendTransactionRequestSchema,
  async (request, node): Promise<void> => {
    const transaction = request.data

    const account = node.accounts.getAccountByName(transaction.fromAccountName)

    if (!account) {
      throw new ValidationError(`No account found with name ${transaction.fromAccountName}`)
    }

    // The node must be connected to the network first
    if (!node.networkBridge.peerNetwork?.isReady) {
      throw new ValidationError(
        `Your node must be connected to the Iron Fish network to send a transaction`,
      )
    }

    const heaviestHead = await node.captain.chain.getHeaviestHead()
    // latest heaviest head must be a block mined in the past minute
    if (
      !heaviestHead ||
      heaviestHead.timestamp < new Date(Date.now() - LATEST_HEAVIEST_TIMESTAMP_AGO)
    ) {
      throw new ValidationError(
        `Your node must be synced with the Iron Fish network to send a transaction. Please try again later`,
      )
    }

    // Check that the node account is updated
    const balance = node.accounts.getBalance(account)
    const sum = BigInt(transaction.amount) + BigInt(transaction.transactionFee)

    if (balance.confirmedBalance < sum && balance.unconfirmedBalance < sum) {
      throw new ValidationError(`Your balance is too low. Add funds to your account first`)
    }

    if (balance.confirmedBalance < sum) {
      throw new ValidationError(
        `Please wait a few seconds for your balance to update and try again`,
      )
    }

    const transactionPosted = await node.accounts.pay(
      node.captain,
      node.memPool,
      account,
      BigInt(transaction.amount),
      BigInt(transaction.transactionFee),
      transaction.memo,
      transaction.toPublicKey,
    )

    request.end({
      amount: transaction.amount,
      toPublicKey: transaction.toPublicKey,
      fromAccountName: account.name,
      transactionHash: transactionPosted.transactionHash().toString('hex'),
    })
  },
)
