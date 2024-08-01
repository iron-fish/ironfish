/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateRandomizedPublicKey, UnsignedTransaction } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { Account } from '../../../wallet'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'

export type SignTransactionRequest = {
  unsignedTransaction: string
}

export type SignTransactionResponse = {
  transaction: string
  account: string
}

export const SignTransactionRequestSchema: yup.ObjectSchema<SignTransactionRequest> = yup
  .object({
    unsignedTransaction: yup.string().defined(),
  })
  .defined()

export const SignTransactionResponseSchema: yup.ObjectSchema<SignTransactionResponse> = yup
  .object({
    transaction: yup.string().defined(),
    account: yup.string().defined(),
  })
  .defined()

routes.register<typeof SignTransactionRequestSchema, SignTransactionResponse>(
  `${ApiNamespace.wallet}/signTransaction`,
  SignTransactionRequestSchema,
  (request, context): void => {
    AssertHasRpcContext(request, context, 'wallet')
    const unsignedTransaction = new UnsignedTransaction(
      Buffer.from(request.data.unsignedTransaction, 'hex'),
    )

    const publicKeyRandomness = unsignedTransaction.publicKeyRandomness()
    const randomizedPublicKey = unsignedTransaction.randomizedPublicKey()

    const account = context.wallet.findAccount(
      (account: Account) =>
        generateRandomizedPublicKey(account.viewKey, publicKeyRandomness) ===
        randomizedPublicKey,
    )

    if (!account) {
      throw new Error('Wallet does not contain sender account for this transaction.')
    }

    if (!account.spendingKey) {
      throw new Error('Account does not have a spending key')
    }

    const serialized = unsignedTransaction.sign(account.spendingKey)

    request.end({
      transaction: serialized.toString('hex'),
      account: account.name,
    })
  },
)
