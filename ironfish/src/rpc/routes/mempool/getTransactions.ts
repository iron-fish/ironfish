/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Decimal from 'decimal.js'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { getPreciseFeeRate } from '../../../memPool'
import { FullNode } from '../../../node'
import { Transaction } from '../../../primitives'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'

export type MinMax = {
  min?: number
  max?: number
}

export type GetMempoolTransactionsRequest = {
  limit?: number
  feeRate?: MinMax
  fee?: MinMax
  expiration?: MinMax
  expiresIn?: MinMax
  position?: MinMax
}

export type GetMempoolTransactionResponse = {
  serializedTransaction: string
  position: number
  expiresIn: number
}

const minMaxSchema = yup.object({
  min: yup.number().optional().min(0),
  max: yup.number().optional(),
})

export const MempoolTransactionsRequestSchema: yup.ObjectSchema<GetMempoolTransactionsRequest> =
  yup
    .object({
      limit: yup.number().min(0),
      feeRate: minMaxSchema.optional(),
      fee: minMaxSchema.optional(),
      expiration: minMaxSchema.optional(),
      position: minMaxSchema.optional(),
      expiresIn: minMaxSchema.optional(),
      stream: yup.boolean().optional(),
    })
    .required()
    .defined()

export const MempoolTransactionResponseSchema: yup.ObjectSchema<GetMempoolTransactionResponse> =
  yup
    .object({
      serializedTransaction: yup.string().defined(),
      position: yup.number().defined(),
      expiresIn: yup.number().defined(),
    })
    .defined()

routes.register<typeof MempoolTransactionsRequestSchema, GetMempoolTransactionResponse>(
  `${ApiNamespace.mempool}/getTransactions`,
  MempoolTransactionsRequestSchema,
  (request, node): void => {
    Assert.isInstanceOf(node, FullNode)

    let position = 0
    let streamed = 0

    const headSequence = node.chain.head.sequence

    for (const transaction of node.memPool.orderedTransactions()) {
      const overPosition =
        request.data?.position?.max !== undefined && position > request.data.position.max
      const underFeeRate =
        request.data?.feeRate?.min !== undefined &&
        getPreciseFeeRate(transaction).lt(new Decimal(request.data.feeRate.min))
      const overLimit = request.data?.limit !== undefined && streamed >= request.data.limit

      // If there are no more viable transactions to send we can just return early
      // This makes the assumption that memPool.orderedTransactions is ordered by feeRate
      if (overPosition || underFeeRate || overLimit) {
        break
      }

      const expiresIn =
        transaction.expiration() === 0 ? 0 : transaction.expiration() - headSequence

      if (includeTransaction(transaction, position, expiresIn, request.data)) {
        request.stream({
          serializedTransaction: transaction.serialize().toString('hex'),
          position,
          expiresIn,
        })
        streamed++
      }

      position++
    }

    request.end()
  },
)

function includeTransaction(
  transaction: Transaction,
  position: number,
  expiresIn: number,
  request: GetMempoolTransactionsRequest,
) {
  return (
    (request.position?.max === undefined || position <= request.position.max) &&
    (request.position?.min === undefined || position >= request.position.min) &&
    (request.fee?.max === undefined || transaction.fee() <= BigInt(request.fee.max)) &&
    (request.fee?.min === undefined || transaction.fee() >= BigInt(request.fee.min)) &&
    (request.feeRate?.max === undefined ||
      getPreciseFeeRate(transaction).lte(new Decimal(request.feeRate.max))) &&
    (request.feeRate?.min === undefined ||
      getPreciseFeeRate(transaction).gte(new Decimal(request.feeRate.min))) &&
    (request.expiration?.max === undefined ||
      transaction.expiration() <= request.expiration.max) &&
    (request.expiration?.min === undefined ||
      transaction.expiration() >= request.expiration.min) &&
    (request.expiresIn?.max === undefined || expiresIn <= request.expiresIn.max) &&
    (request.expiresIn?.min === undefined || expiresIn >= request.expiresIn.min)
  )
}
