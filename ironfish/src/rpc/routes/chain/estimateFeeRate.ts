/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { PRIORITY_LEVELS, PriorityLevel } from '../../../memPool/feeEstimator'
import { FullNode } from '../../../node'
import { CurrencyUtils } from '../../../utils'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'

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

routes.register<typeof EstimateFeeRateRequestSchema, EstimateFeeRateResponse>(
  `${ApiNamespace.chain}/estimateFeeRate`,
  EstimateFeeRateRequestSchema,
  (request, node): void => {
    Assert.isInstanceOf(node, FullNode)

    const priority = request.data?.priority ?? 'average'
    const rate = node.memPool.feeEstimator.estimateFeeRate(priority)
    request.end({ rate: CurrencyUtils.encode(rate) })
  },
)
