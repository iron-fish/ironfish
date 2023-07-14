/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { IronfishNode } from '../../../node'
import { RpcRequest } from '../../request'

export type Request = undefined
export type Response = {
  networkId: number
}

export const RequestSchema: yup.MixedSchema<Request> = yup.mixed().oneOf([undefined] as const)

export const GetNetworkInfoResponseSchema: yup.ObjectSchema<Response> = yup
  .object({
    networkId: yup.number().defined(),
  })
  .defined()

export const route = 'getNetworkInfo'
export const handle = (request: RpcRequest<Request, Response>, node: IronfishNode): void => {
  request.end({
    networkId: node.internal.get('networkId'),
  })
}
