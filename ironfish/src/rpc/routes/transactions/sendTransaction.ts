/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ERROR_CODES, ValidationError } from '../../adapters/errors'
import { ApiNamespace, router } from '../router'

export type SendTransactionRequest = {
  fromAccountName: string
  receives: {
    publicAddress: string
    amount: string
    memo: string
  }[]
  fee: string
  expirationSequence?: number | null
  expirationSequenceDelta?: number | null
}

export type SendTransactionResponse = {
  receives: {
    publicAddress: string
    amount: string
    memo: string
  }[]
  fromAccountName: string
  hash: string
}

export const SendTransactionRequestSchema: yup.ObjectSchema<SendTransactionRequest> = yup
  .object({
    fromAccountName: yup.string().defined(),
    receives: yup
      .array(
        yup
          .object({
            publicAddress: yup.string().defined(),
            amount: yup.string().defined(),
            memo: yup.string().defined(),
          })
          .defined(),
      )
      .defined(),
    fee: yup.string().defined(),
    expirationSequence: yup.number().nullable().optional(),
    expirationSequenceDelta: yup.number().nullable().optional(),
  })
  .defined()

export const SendTransactionResponseSchema: yup.ObjectSchema<SendTransactionResponse> = yup
  .object({
    receives: yup
      .array(
        yup
          .object({
            publicAddress: yup.string().defined(),
            amount: yup.string().defined(),
            memo: yup.string().defined(),
          })
          .defined(),
      )
      .defined(),
    fromAccountName: yup.string().defined(),
    hash: yup.string().defined(),
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
    if (!node.peerNetwork.isReady) {
      throw new ValidationError(
        `Your node must be connected to the Iron Fish network to send a transaction`,
      )
    }

    if (!node.chain.synced) {
      throw new ValidationError(
        `Your node must be synced with the Iron Fish network to send a transaction. Please try again later`,
      )
    }

    // Check that the node account is updated
    const balance = await node.accounts.getBalance(account)
    const sum =
      transaction.receives.reduce((acc, receive) => acc + BigInt(receive.amount), BigInt(0)) +
      BigInt(transaction.fee)

    if (balance.confirmed < sum && balance.unconfirmed < sum) {
      throw new ValidationError(
        `Your balance is too low. Add funds to your account first`,
        undefined,
        ERROR_CODES.INSUFFICIENT_BALANCE,
      )
    }

    if (balance.confirmed < sum) {
      throw new ValidationError(
        `Please wait a few seconds for your balance to update and try again`,
        undefined,
        ERROR_CODES.INSUFFICIENT_BALANCE,
      )
    }

    const receives = transaction.receives.map((receive) => {
      return {
        publicAddress: receive.publicAddress,
        amount: BigInt(receive.amount),
        memo: receive.memo,
      }
    })

    const transactionPosted = await node.accounts.pay(
      node.memPool,
      account,
      receives,
      BigInt(transaction.fee),
      transaction.expirationSequenceDelta ??
        node.config.get('defaultTransactionExpirationSequenceDelta'),
      transaction.expirationSequence,
    )

    request.end({
      receives: transaction.receives,
      fromAccountName: account.name,
      hash: transactionPosted.hash().toString('hex'),
    })
  },
)
