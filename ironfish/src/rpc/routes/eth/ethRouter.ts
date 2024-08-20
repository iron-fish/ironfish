/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { id } from 'ethers'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { RpcRequest } from '../../request'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import {
  sendRawTransaction,
  SendRawTransactionRequest,
  SendRawTransactionResponse,
} from './sendRawTransaction'
import {
  EthSendTransactionRequest,
  EthSendTransactionResponse,
  sendTransaction,
} from './sendTransaction'

export type SendRequest = {
  jsonrpc: '2.0'
  id: number | string
  method: 'eth_sendTransaction'
  params: EthSendTransactionRequest[]
}

export type SendRawRequest = {
  jsonrpc: '2.0'
  id: number | string
  method: 'eth_sendRawTransaction'
  params: SendRawTransactionRequest[]
}

export type RouterRequest = SendRequest | SendRawRequest

export type RouterResponse = {
  result: string
}

const SendRequestSchema: yup.ObjectSchema<SendRequest> = yup
  .object({
    jsonrpc: yup.string<'2.0'>().required().equals(['2.0']),
    id: yup.mixed<number | string>().required(),
    method: yup.string<'eth_sendTransaction'>().required(),
    params: yup.mixed<EthSendTransactionRequest[]>().required(),
  })
  .defined()
const router: yup.MixedSchema<
const SendRawRequestSchema: yup.ObjectSchema<SendRawRequest> = yup
  .object({
    jsonrpc: yup.string<'2.0'>().required().equals(['2.0']),
    id: yup.mixed<number | string>().required(),
    method: yup.string<'eth_sendRawTransaction'>().required(),
    params: yup
      .array()
      .of(
        yup.object().shape({
          // Define the shape of SendRawTransactionRequest
        }),
      )
      .required(),
  })
  .defined()

export const RouterRequestSchema: yup.MixedSchema<RouterRequest> = yup
  .mixed<RouterRequest>()
  .test('is-send-request', 'Invalid SendRequest', (value) =>
    SendRequestSchema.isValidSync(value),
  )
  .test('is-send-raw-request', 'Invalid SendRawRequest', (value) =>
    SendRawRequestSchema.isValidSync(value),
  )
  .defined()
export const RouterResponseSchema: yup.ObjectSchema<RouterResponse> = yup
  .object({
    result: yup.string().required(),
  })
  .defined()

routes.register<typeof RouterRequestSchema, RouterRequest>(
  `${ApiNamespace.eth}/ethRouter`,
  RouterRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

    if (request.data.method === 'eth_sendTransaction') {
      const req = new RpcRequest<EthSendTransactionRequest, EthSendTransactionResponse>(
        request.data.params[0],
        '',
        request.onEnd as (status: number, data?: unknown) => void,
        request.onStream as (data: unknown) => void,
      )
      await sendTransaction(req, node)
    } else if (request.data.method === 'eth_sendRawTransaction') {
      const req = new RpcRequest<SendRawTransactionRequest, SendRawTransactionResponse>(
        request.data.params[0],
        '',
        request.onEnd as (status: number, data?: unknown) => void,
        request.onStream as (data: unknown) => void,
      )
      await sendRawTransaction(req, node)
    }
  },
)
