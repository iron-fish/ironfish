/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateRandomizedPublicKey, UnsignedTransaction } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { Account } from '../../../wallet'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'

export type AddSignatureRequest = {
  unsignedTransaction: string
  signature: string
}

export type AddSignatureResponse = {
  transaction: string
  account: string
}

export const AddSignatureRequestSchema: yup.ObjectSchema<AddSignatureRequest> = yup
  .object({
    unsignedTransaction: yup.string().defined(),
    signature: yup.string().defined(),
  })
  .defined()

export const AddSignatureResponseSchema: yup.ObjectSchema<AddSignatureResponse> = yup
  .object({
    transaction: yup.string().defined(),
    account: yup.string().defined(),
  })
  .defined()

routes.register<typeof AddSignatureRequestSchema, AddSignatureResponse>(
  `${ApiNamespace.wallet}/addSignature`,
  AddSignatureRequestSchema,
  (request, node): void => {
    AssertHasRpcContext(request, node, 'wallet')
    const unsignedTransaction = new UnsignedTransaction(
      Buffer.from(request.data.unsignedTransaction, 'hex'),
    )

    const buffer = Buffer.from(request.data.signature, 'hex')

    if (buffer.length !== 64) {
      throw new Error('Invalid signature length')
    }

    const publicKeyRandomness = unsignedTransaction.publicKeyRandomness()
    const randomizedPublicKey = unsignedTransaction.randomizedPublicKey()

    const account = node.wallet.findAccount(
      (account: Account) =>
        generateRandomizedPublicKey(account.viewKey, publicKeyRandomness) ===
        randomizedPublicKey,
    )

    if (!account) {
      throw new Error('Wallet does not contain sender account for this transaction.')
    }

    const serialized = unsignedTransaction.addSignature(buffer)

    request.end({
      transaction: serialized.toString('hex'),
      account: account.name,
    })
  },
)
