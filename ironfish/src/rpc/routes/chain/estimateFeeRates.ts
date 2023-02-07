/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { PRIORITY_LEVELS, PriorityLevel } from '../../../memPool/feeEstimator'
import { ApiNamespace, router } from '../router'

export type EstimateFeeRatesRequest = { priority?: PriorityLevel } | undefined
export type EstimateFeeRatesResponse = {
  slow?: string
  average?: string
  fast?: string
}

export const EstimateFeeRatesRequestSchema: yup.ObjectSchema<EstimateFeeRatesRequest> = yup
  .object({
    priority: yup.string().oneOf(PRIORITY_LEVELS),
  })
  .optional()

export const EstimateFeeRatesResponseSchema: yup.ObjectSchema<EstimateFeeRatesResponse> = yup
  .object({
    slow: yup.string(),
    average: yup.string(),
    fast: yup.string(),
  })
  .defined()

router.register<typeof EstimateFeeRatesRequestSchema, EstimateFeeRatesResponse>(
  `${ApiNamespace.chain}/estimateFeeRates`,
  EstimateFeeRatesRequestSchema,
  (request, node): void => {
    const priority = request.data?.priority

    const feeEstimator = node.memPool.feeEstimator

    if (priority) {
      const feeRate = feeEstimator.estimateFeeRate(priority)

      request.end({
        [priority]: feeRate,
      })
    } else {
      const feeRates = feeEstimator.estimateFeeRates()

      request.end({
        slow: feeRates.low > 0 ? feeRates.low.toString() : '1',
        average: feeRates.medium > 0 ? feeRates.medium.toString() : '1',
        fast: feeRates.high > 0 ? feeRates.high.toString() : '1',
      })
    }
  },
)
