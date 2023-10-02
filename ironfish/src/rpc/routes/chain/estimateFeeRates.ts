/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { CurrencyUtils } from '../../../utils'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'

export type EstimateFeeRatesRequest = undefined
export type EstimateFeeRatesResponse = {
  slow: string
  average: string
  fast: string
}

export const EstimateFeeRatesRequestSchema: yup.MixedSchema<EstimateFeeRatesRequest> = yup
  .mixed()
  .oneOf([undefined] as const)

export const EstimateFeeRatesResponseSchema: yup.ObjectSchema<EstimateFeeRatesResponse> = yup
  .object({
    slow: yup.string().defined(),
    average: yup.string().defined(),
    fast: yup.string().defined(),
  })
  .defined()

routes.register<typeof EstimateFeeRatesRequestSchema, EstimateFeeRatesResponse>(
  `${ApiNamespace.chain}/estimateFeeRates`,
  EstimateFeeRatesRequestSchema,
  (request, node): void => {
    Assert.isInstanceOf(node, FullNode)

    const rates = node.memPool.feeEstimator.estimateFeeRates()

    request.end({
      slow: CurrencyUtils.encode(rates.slow),
      average: CurrencyUtils.encode(rates.average),
      fast: CurrencyUtils.encode(rates.fast),
    })
  },
)
