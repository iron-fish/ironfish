/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { PRIORITY_LEVELS, PriorityLevel } from '../../../memPool/feeEstimator'
import { ApiNamespace, router } from '../router'

export type EstimateFeeRatesRequest = { priority?: PriorityLevel }
export type EstimateFeeRatesResponse = {
  feeRates: { priority: PriorityLevel; feeRate: string }[]
}

export const EstimateFeeRatesRequestSchema: yup.ObjectSchema<EstimateFeeRatesRequest> = yup
  .object({
    priority: yup.string().oneOf(PRIORITY_LEVELS),
  })
  .defined()

export const EstimateFeeRatesResponseSchema: yup.ObjectSchema<EstimateFeeRatesResponse> = yup
  .object({
    feeRates: yup
      .array(
        yup
          .object({
            priority: yup.string().oneOf(PRIORITY_LEVELS).defined(),
            feeRate: yup.string().defined(),
          })
          .defined(),
      )
      .defined(),
  })
  .defined()

router.register<typeof EstimateFeeRatesRequestSchema, EstimateFeeRatesResponse>(
  `${ApiNamespace.fees}/estimateFeeRates`,
  EstimateFeeRatesRequestSchema,
  (request, node): void => {
    const priority = request.data.priority

    const feeEstimator = node.memPool.feeEstimator

    if (priority) {
      const feeRate = feeEstimator.estimateFeeRate(priority)

      request.end({
        feeRates: [{ priority, feeRate: feeRate.toString() }],
      })
    } else {
      const feeRates = []

      for (const { priority, feeRate } of feeEstimator.estimateFeeRates()) {
        feeRates.push({ priority, feeRate: feeRate.toString() })
      }

      request.end({
        feeRates,
      })
    }
  },
)
