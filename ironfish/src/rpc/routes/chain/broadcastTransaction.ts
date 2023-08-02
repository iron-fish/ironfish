/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { Transaction } from '../../../primitives'
import { ValidationError } from '../../adapters'
import { ApiNamespace, routes } from '../router'

export type BroadcastTransactionRequest = {
  transaction: string
}

export type BroadcastTransactionResponse = {
  hash: string
  accepted: boolean
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
    })
    .defined()

routes.register<typeof BroadcastTransactionRequestSchema, BroadcastTransactionResponse>(
  `${ApiNamespace.chain}/broadcastTransaction`,
  BroadcastTransactionRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

    if (!node.peerNetwork.isReady) {
      throw new ValidationError('Cannot broadcast transaction. Peer network is not ready')
    }

    const data = Buffer.from(request.data.transaction, 'hex')
    const transaction = new Transaction(data)

    const verify = await node.chain.verifier.verifyNewTransaction(transaction)
    if (!verify.valid) {
      throw new ValidationError(`Invalid transaction, reason: ${String(verify.reason)}`)
    }

    const accepted = node.memPool.acceptTransaction(transaction)
    node.peerNetwork.broadcastTransaction(transaction)

    request.end({
      accepted,
      hash: transaction.hash().toString('hex'),
    })
  },
)
