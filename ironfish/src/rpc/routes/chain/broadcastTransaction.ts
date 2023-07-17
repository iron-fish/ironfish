/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'
import { Assert } from '../../../assert'
import { Transaction } from '../../../primitives'
import { ValidationError } from '../../adapters'
import { ApiNamespace, routes } from '../router'

export type BroadcastTransactionRequest = {
  transaction: string
}

export type BroadcastTransactionResponse = {
  hash: string
}

export const BroadcastTransactionRequestSchema: yup.ObjectSchema<BroadcastTransactionRequest> =
  yup
    .object({
      transaction: yup.string().defined(),
    })
    .defined()

export const BroadcastTransactionResponseSchema: yup.ObjectSchema<BroadcastTransactionResponse> =
  yup
    .object({
      hash: yup.string().defined(),
    })
    .defined()

routes.register<typeof BroadcastTransactionRequestSchema, BroadcastTransactionResponse>(
  `${ApiNamespace.chain}/broadcastTransaction`,
  BroadcastTransactionRequestSchema,
  (request, { node }): void => {
    Assert.isNotUndefined(node)

    const data = Buffer.from(request.data.transaction, 'hex')
    const transaction = new Transaction(data)

    const verify = node.chain.verifier.verifyCreatedTransaction(transaction)
    if (!verify.valid) {
      throw new ValidationError(`Invalid transaction, reason: ${String(verify.reason)}`)
    }

    node.memPool.acceptTransaction(transaction)
    node.peerNetwork.broadcastTransaction(transaction)

    request.end({
      hash: transaction.hash().toString('hex'),
    })
  },
)
