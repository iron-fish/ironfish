/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { PRIORITY_LEVELS, PriorityLevel } from '../../../memPool/feeEstimator'
import { IronfishNode } from '../../../node'
import { CurrencyUtils } from '../../../utils'
import { RpcRequest } from '../../request'

export type Request = { priority?: PriorityLevel } | undefined

export type Response = {
  rate: string
}

export const RequestSchema: yup.ObjectSchema<Request> = yup
  .object({
    priority: yup.string().oneOf(PRIORITY_LEVELS),
  })
  .optional()

export const ResponseSchema: yup.ObjectSchema<Response> = yup
  .object({
    rate: yup.string(),
  })
  .defined()

export const route = 'estimateFeeRate'
export const handle = (request: RpcRequest<Request, Response>, node: IronfishNode): void => {
  const priority = request.data?.priority ?? 'average'
  const rate = node.memPool.feeEstimator.estimateFeeRate(priority)
  request.end({ rate: CurrencyUtils.encode(rate) })
}
