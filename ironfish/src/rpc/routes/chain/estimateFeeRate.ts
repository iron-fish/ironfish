/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { PRIORITY_LEVELS, PriorityLevel } from '../../../memPool/feeEstimator'
import { CurrencyUtils } from '../../../utils'
import { ApiNamespace, router } from '../router'

export type EstimateFeeRateRequest = { priority?: PriorityLevel } | undefined

export type EstimateFeeRateResponse = {
  rate: string
}

export const EstimateFeeRateRequestSchema: yup.ObjectSchema<EstimateFeeRateRequest> = yup
  .object({
    priority: yup.string().oneOf(PRIORITY_LEVELS),
  })
  .optional()

export const EstimateFeeRateResponseSchema: yup.ObjectSchema<EstimateFeeRateResponse> = yup
  .object({
    rate: yup.string(),
  })
  .defined()

router.register<typeof EstimateFeeRateRequestSchema, EstimateFeeRateResponse>(
  `${ApiNamespace.chain}/estimateFeeRate`,
  EstimateFeeRateRequestSchema,
  (request, node): void => {
    const priority = request.data?.priority ?? 'medium'
    const rate = node.memPool.feeEstimator.estimateFeeRate(priority)
    request.end({ rate: CurrencyUtils.encode(rate) })
  },
)
