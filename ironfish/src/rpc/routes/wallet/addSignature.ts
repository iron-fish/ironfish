/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { UnsignedTransaction } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { Transaction } from '../../../primitives/transaction'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'

export type AddSignatureRequest = {
  unsignedTransaction: string
  signature: string
  broadcast?: boolean
}

export type AddSignatureResponse = {
  accepted: boolean
  broadcasted: boolean
  transaction: string
}

export const AddSignatureRequestSchema: yup.ObjectSchema<AddSignatureRequest> = yup
  .object({
    unsignedTransaction: yup.string().defined(),
    signature: yup.string().defined(),
    broadcast: yup.boolean().optional().default(true),
  })
  .defined()

export const AddSignatureResponseSchema: yup.ObjectSchema<AddSignatureResponse> = yup
  .object({
    accepted: yup.boolean().defined(),
    broadcasted: yup.boolean().defined(),
    transaction: yup.string().defined(),
  })
  .defined()

routes.register<typeof AddSignatureRequestSchema, AddSignatureResponse>(
  `${ApiNamespace.wallet}/addSignature`,
  AddSignatureRequestSchema,
  async (request, node): Promise<void> => {
    AssertHasRpcContext(request, node, 'wallet')
    const unsignedTransaction = new UnsignedTransaction(
      Buffer.from(request.data.unsignedTransaction, 'hex'),
    )

    const serialized = unsignedTransaction.addSignature(request.data.signature)
    const transaction = new Transaction(serialized)

    let accepted = false
    let broadcasted = false

    if (request.data.broadcast) {
      await node.wallet.addPendingTransaction(transaction)
      const result = await node.wallet.broadcastTransaction(transaction)
      accepted = result.accepted
      broadcasted = result.broadcasted
    }

    request.end({
      accepted,
      broadcasted,
      transaction: serialized.toString('hex'),
    })
  },
)
