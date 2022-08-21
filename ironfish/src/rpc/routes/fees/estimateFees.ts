/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
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
  (request, node): void => {
    const targetConfirmSpeed = BigInt(request.data.targetConfirmSpeed)

    let highestFee = BigInt(1)
    let totalTransactionFees = BigInt(0)
    let totalTransactions = BigInt(0)

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

    for (const transaction of node.memPool.orderedTransactions()) {
      if (totalTransactions === BigInt(0)) {
        highestFee = transaction.fee()
      }
      totalTransactionFees += transaction.fee()
      totalTransactions += BigInt(1)

      if (totalTransactions === BigInt(150)) {
        high = transaction.fee()
      } else if (totalTransactions === BigInt(750)) {
        medium = transaction.fee()
      } else if (totalTransactions === BigInt(1500)) {
        slow = transaction.fee()
      } else if (totalTransactions === targetConfirmSpeed * 150n) {
        target = totalTransactionFees / totalTransactions
      }
    }
    if (targetConfirmSpeed === BigInt(1)) {
      target = high
    } else if (targetConfirmSpeed === BigInt(5)) {
      target = medium
    } else if (targetConfirmSpeed === BigInt(10)) {
      target = slow
    }
    const avgFee = totalTransactionFees / totalTransactions

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
