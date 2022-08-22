/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Transaction } from '../../../primitives'
import { ApiNamespace, router } from '../router'

export type EstimateFeesRequest = { targetConfirmSpeed: number }
export type EstimateFeesResponse = {
  target: number
  highestFee: number
  avgFee: number
  high: number
  medium: number
  slow: number
}

export const EstimateFeesRequestSchema: yup.ObjectSchema<EstimateFeesRequest> = yup
  .object({
    targetConfirmSpeed: yup.number().defined(),
  })
  .defined()

export const EstimateFeesResponseSchema: yup.ObjectSchema<EstimateFeesResponse> = yup
  .object({
    target: yup.number().defined(),
    highestFee: yup.number().defined(),
    avgFee: yup.number().defined(),
    high: yup.number().defined(),
    medium: yup.number().defined(),
    slow: yup.number().defined(),
  })
  .defined()

router.register<typeof EstimateFeesRequestSchema, EstimateFeesResponse>(
  `${ApiNamespace.fees}/estimateFees`,
  EstimateFeesRequestSchema,
  async (request, node): Promise<void> => {
    const targetConfirmSpeed = request.data.targetConfirmSpeed

    let highestFee = BigInt(1)
    let totalTransactionFees = BigInt(0)
    let totalTransactions = 0

    // Considering max transactions can be mined in a block is 300 now,
    // we suppose that a transaction can be mined in the next block if fee of this transaction stays in top300.
    // To ensure confirmation speed and save unnecessary fee, we choose fee of the 150th transaction of all mempool transactions as our transaction target fee.

    // Mined in the next block
    let high = BigInt(1)
    // Mined in the next 5 blocks
    let medium = BigInt(1)
    // Mined in the next 10 blocks
    let slow = BigInt(1)

    let target = BigInt(1)

    // Top 6000 (next 20 blocks) transactions are considered.
    const mempoolHandleTransactions: Transaction[] = []
    let txCount = 0
    for (const transaction of node.memPool.orderedTransactions()) {
      mempoolHandleTransactions.push(transaction)
      txCount += 1
      if (txCount >= 6000) {
        break
      }
    }

    const transactionFees = await Promise.all(mempoolHandleTransactions.map((t) => t.fee()))
    for (const fee of transactionFees) {
      if (totalTransactions === 0) {
        highestFee = fee
      }
      totalTransactionFees += fee
      totalTransactions += 2

      if (totalTransactions === 150) {
        high = fee
      } else if (totalTransactions === 750) {
        medium = fee
      } else if (totalTransactions === 1500) {
        slow = fee
      } else if (totalTransactions === targetConfirmSpeed * 150) {
        target = totalTransactionFees / BigInt(totalTransactions)
      }
    }

    if (targetConfirmSpeed === 1) {
      target = high
    } else if (targetConfirmSpeed === 5) {
      target = medium
    } else if (targetConfirmSpeed === 10) {
      target = slow
    }
    const avgFee = totalTransactionFees / BigInt(totalTransactions)

    request.end({
      target: Number(target),
      highestFee: Number(highestFee),
      avgFee: Number(avgFee),
      high: Number(high),
      medium: Number(medium),
      slow: Number(slow),
    })
  },
)
