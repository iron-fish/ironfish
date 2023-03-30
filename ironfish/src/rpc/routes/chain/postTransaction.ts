/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Transaction } from '../../../primitives'
import { ApiNamespace, router } from '../router'

export type PostSignedTransactionRequest = {
  transaction: string
}

export type PostSignedTransactionResponse = {
  success: boolean
  reason?: string
}

export const PostSignedTransactionRequestSchema: yup.ObjectSchema<PostSignedTransactionRequest> =
  yup
    .object({
      transaction: yup.string().defined(),
    })
    .defined()

export const PostSignedTransactionResponseSchema: yup.ObjectSchema<PostSignedTransactionResponse> =
  yup
    .object({
      success: yup.boolean().defined(),
      reason: yup.string().optional(),
    })
    .defined()

router.register<typeof PostSignedTransactionRequestSchema, PostSignedTransactionResponse>(
  `${ApiNamespace.chain}/postTransaction`,
  PostSignedTransactionRequestSchema,
  async (request, node): Promise<void> => {
    const buffer = Buffer.from(request.data.transaction, 'hex')
    const transaction = new Transaction(buffer)

    // Some verification
    const firstVerify = node.chain.verifier.verifyCreatedTransaction(transaction)
    if (!firstVerify.valid) {
      request.end({ success: false, reason: JSON.stringify(firstVerify.reason) })
    }

    const secondVerify = await node.chain.verifier.verifyTransactionSpends(transaction)
    if (!secondVerify.valid) {
      request.end({ success: false, reason: JSON.stringify(secondVerify.reason) })
    }

    const thirdVerify = await node.chain.verifier.verifyNewTransaction(transaction)
    if (!thirdVerify.valid) {
      request.end({ success: false, reason: JSON.stringify(thirdVerify.reason) })
    }

    const fourthVerify = node.wallet.memPool.acceptTransaction(transaction)
    if (!fourthVerify) {
      request.end({ success: false, reason: 'Mempool rejected' })
    }

    await node.wallet.addPendingTransaction(transaction)
    node.wallet.broadcastTransaction(transaction)
    node.wallet.onTransactionCreated.emit(transaction)

    request.end({ success: true })
  },
)
