/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Transaction } from '../../../primitives'
import { ApiNamespace, router } from '../router'

export type ChainAddTransactionRequest = {
  transaction: string
}

export type ChainAddTransactionResponse = {
  success: boolean
  reason?: string
}

export const ChainAddTransactionRequestSchema: yup.ObjectSchema<ChainAddTransactionRequest> =
  yup
    .object({
      transaction: yup.string().defined(),
    })
    .defined()

export const ChainAddTransactionResponseSchema: yup.ObjectSchema<ChainAddTransactionResponse> =
  yup
    .object({
      success: yup.boolean().defined(),
      reason: yup.string().optional(),
    })
    .defined()

router.register<typeof ChainAddTransactionRequestSchema, ChainAddTransactionResponse>(
  `${ApiNamespace.chain}/addTransaction`,
  ChainAddTransactionRequestSchema,
  async (request, node): Promise<void> => {
    const buffer = Buffer.from(request.data.transaction, 'hex')
    const transaction = new Transaction(buffer)

    // Some verification

    const firstVerify = await node.chain.verifier.verifyNewTransaction(transaction)
    if (!firstVerify.valid) {
      request.end({ success: false, reason: JSON.stringify(firstVerify.reason) })
    }

    const secondVerify = node.wallet.memPool.acceptTransaction(transaction)
    if (!secondVerify) {
      request.end({ success: false, reason: 'Mempool rejected' })
    }

    await node.wallet.addPendingTransaction(transaction)
    node.wallet.broadcastTransaction(transaction)
    node.wallet.onTransactionCreated.emit(transaction)

    request.end({ success: true })
  },
)
