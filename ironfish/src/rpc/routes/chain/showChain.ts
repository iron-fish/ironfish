/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { IronfishNode } from '../../../node'
import { RpcRequest } from '../../request'
import { renderChain } from './utils'

export type Request =
  | {
      start?: number | null
      stop?: number | null
    }
  | undefined

export type Response = {
  content: string[]
}

export const RequestSchema: yup.ObjectSchema<Request> = yup
  .object({
    start: yup.number().nullable().optional(),
    stop: yup.number().nullable().optional(),
  })
  .optional()

export const ResponseSchema: yup.ObjectSchema<Response> = yup
  .object({
    content: yup.array(yup.string().defined()).defined(),
  })
  .defined()

export const route = 'showChain'
export const handle = async (
  request: RpcRequest<Request, Response>,
  node: IronfishNode,
): Promise<void> => {
  const content = await renderChain(node.chain, request.data?.start, request.data?.stop, {
    indent: '  ',
    work: false,
  })

  request.end({ content })
}
