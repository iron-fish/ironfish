/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { getFeeRate, MemPool } from '../../../memPool'
import { Transaction } from '../../../primitives'
import { ApiNamespace, router } from '../router'

type MinMax = {
  min?: number
  max?: number
}

export type GetMempoolTransactionsRequest = {
  limit?: number
  feeRate?: MinMax
  fee?: MinMax
  expiration?: MinMax
  position?: MinMax
  stream?: boolean
}

export type GetMempoolTransactionResponse = {
  serializedTransaction: string
  position: number
}

export type GetMempoolTransactionsResponse = {
  transactions: GetMempoolTransactionResponse[]
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
      stream: yup.boolean().optional(),
    })
    .required()
    .defined()

export const MempoolTransactionsResponseSchema: yup.ObjectSchema<GetMempoolTransactionsResponse> =
  yup
    .object({
      transactions: yup
        .array()
        .of(
          yup
            .object({
              serializedTransaction: yup.string().defined(),
              position: yup.number().defined(),
            })
            .defined(),
        )
        .defined(),
    })
    .defined()

router.register<typeof MempoolTransactionsRequestSchema, GetMempoolTransactionsResponse>(
  `${ApiNamespace.mempool}/getTransactions`,
  MempoolTransactionsRequestSchema,
  (request, node): void => {
    if (!request.data.stream) {
      request.end({ transactions: getTransactions(node.memPool, request.data) })
      return
    }

    request.stream({
      transactions: getTransactions(node.memPool, request.data),
    })

    const interval = setInterval(() => {
      request.stream({
        transactions: getTransactions(node.memPool, request.data),
      })
    }, 5000)

    request.onClose.on(() => {
      clearInterval(interval)
    })

    request.end({
      transactions: getTransactions(node.memPool, request.data),
    })
  },
)

function getTransactions(memPool: MemPool, request: GetMempoolTransactionsRequest) {
  const serializedTransactions: GetMempoolTransactionResponse[] = []

  let position = 0
  for (const transaction of memPool.orderedTransactions()) {
    if (request.limit !== undefined && serializedTransactions.length >= request.limit) {
      break
    }

    if (includeTransaction(transaction, position, request)) {
      serializedTransactions.push({
        serializedTransaction: transaction.serialize().toString('hex'),
        position,
      })
    }

    position++
  }

  return serializedTransactions
}

function includeTransaction(
  transaction: Transaction,
  position: number,
  request: GetMempoolTransactionsRequest,
) {
  return (
    (request.position?.max === undefined || position <= request.position.max) &&
    (request.position?.min === undefined || position >= request.position.min) &&
    (request.fee?.max === undefined || transaction.fee() <= BigInt(request.fee.max)) &&
    (request.fee?.min === undefined || transaction.fee() >= BigInt(request.fee.min)) &&
    (request.feeRate?.max === undefined ||
      getFeeRate(transaction) <= BigInt(request.feeRate.max)) &&
    (request.feeRate?.min === undefined ||
      getFeeRate(transaction) >= BigInt(request.feeRate.min)) &&
    (request.expiration?.max === undefined ||
      transaction.expiration() <= request.expiration.max) &&
    (request.expiration?.min === undefined ||
      transaction.expiration() >= request.expiration.min)
  )
}
