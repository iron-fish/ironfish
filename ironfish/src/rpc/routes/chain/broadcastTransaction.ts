/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { Transaction } from '../../../primitives'
import { RpcValidationError } from '../../adapters'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'

export type BroadcastTransactionRequest = {
  transaction: string
}

export type BroadcastTransactionResponse = {
  hash: string
  accepted: boolean
  broadcasted: boolean
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
      accepted: yup.boolean().defined(),
      broadcasted: yup.boolean().defined(),
    })
    .defined()

routes.register<typeof BroadcastTransactionRequestSchema, BroadcastTransactionResponse>(
  `${ApiNamespace.chain}/broadcastTransaction`,
  BroadcastTransactionRequestSchema,
  async (request, context): Promise<void> => {
    Assert.isInstanceOf(context, FullNode)

    const data = Buffer.from(request.data.transaction, 'hex')
    const transaction = new Transaction(data)

    const verify = await context.chain.verifier.verifyNewTransaction(transaction)
    if (!verify.valid) {
      throw new RpcValidationError(`Invalid transaction, reason: ${String(verify.reason)}`)
    }

    const accepted = context.memPool.acceptTransaction(transaction)

    let broadcasted = false
    if (context.peerNetwork.isReady) {
      context.peerNetwork.broadcastTransaction(transaction)
      broadcasted = true
    }

    request.end({
      accepted,
      broadcasted,
      hash: transaction.hash().toString('hex'),
    })
  },
)
