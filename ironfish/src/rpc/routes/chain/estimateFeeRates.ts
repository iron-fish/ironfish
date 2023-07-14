/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { IronfishNode } from '../../../node'
import { CurrencyUtils } from '../../../utils'
import { RpcRequest } from '../../request'

export type Request = undefined
export type Response = {
  slow: string
  average: string
  fast: string
}

export const RequestSchema: yup.MixedSchema<Request> = yup.mixed().oneOf([undefined] as const)

export const ResponseSchema: yup.ObjectSchema<Response> = yup
  .object({
    slow: yup.string().defined(),
    average: yup.string().defined(),
    fast: yup.string().defined(),
  })
  .defined()

export const route = 'estimateFeeRates'
export const handle = (request: RpcRequest<Request, Response>, node: IronfishNode): void => {
  const rates = node.memPool.feeEstimator.estimateFeeRates()

  request.end({
    slow: CurrencyUtils.encode(rates.slow),
    average: CurrencyUtils.encode(rates.average),
    fast: CurrencyUtils.encode(rates.fast),
  })
}
