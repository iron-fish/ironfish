/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { isValidPublicAddress } from '../../../wallet/validator'
import { RpcRequest } from '../../request'

export type Request = {
  address: string
}

export type Response = {
  valid: boolean
}

export const route = 'isValidPublicAddress'
export const RequestSchema: yup.ObjectSchema<Request> = yup
  .object({
    address: yup.string().defined(),
  })
  .defined()

export const ResponseSchema: yup.ObjectSchema<Response> = yup
  .object({
    valid: yup.boolean().defined(),
  })
  .defined()

export const handle = (request: RpcRequest<Request, Response>): void => {
  request.end({
    valid: isValidPublicAddress(request.data.address),
  })
}
