/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { PRIORITY_LEVELS, PriorityLevel } from '../../../memPool/feeEstimator'
import { ApiNamespace, router } from '../router'

export type EstimateFeeRateRequest = { priority: PriorityLevel }
export type EstimateFeeRateResponse = { feeRate: string }

export const EstimateFeeRateRequestSchema: yup.ObjectSchema<EstimateFeeRateRequest> = yup
  .object({
    priority: yup.string().oneOf(PRIORITY_LEVELS).defined(),
  })
  .defined()

export const EstimateFeeRateResponseSchema: yup.ObjectSchema<EstimateFeeRateResponse> = yup
  .object({
    feeRate: yup.string().defined(),
  })
  .defined()

router.register<typeof EstimateFeeRateRequestSchema, EstimateFeeRateResponse>(
  `${ApiNamespace.fees}/estimateFeeRate`,
  EstimateFeeRateRequestSchema,
  (request, node): void => {
    const priority = request.data.priority

    const feeEstimator = node.memPool.feeEstimator

    const feeRate = feeEstimator.estimateFeeRate(priority)

    request.end({
      feeRate: feeRate.toString(),
    })
  },
)
