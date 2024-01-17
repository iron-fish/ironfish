/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'

export const MESSAGE_DELIMITER = '\f'

export type ClientSocketRpc = {
  type: 'message'
  data: SocketRpcRequest
}

export type ServerSocketRpc = {
  type: 'message' | 'malformedRequest' | 'error' | 'stream'
  data: SocketRpcResponse | SocketRpcError | SocketRpcStream
}

export type SocketRpcRequest = {
  mid: number
  type: string
  auth: string | null | undefined
  data: unknown
}

export type SocketRpcResponse = {
  id: number
  status: number
  data: unknown
}

export type SocketRpcStream = {
  id: number
  data: unknown
}

export type SocketRpcError = {
  code: string
  message: string
  stack?: string
}

export const ClientSocketRpcSchema: yup.ObjectSchema<ClientSocketRpc> = yup
  .object({
    type: yup.string().oneOf(['message']).required(),
    data: yup
      .object({
        mid: yup.number().required(),
        type: yup.string().required(),
        auth: yup.string().nullable().notRequired(),
        data: yup.mixed().notRequired(),
      })
      .required(),
  })
  .required()

export const ServerSocketRpcSchema: yup.ObjectSchema<ServerSocketRpc> = yup
  .object({
    type: yup.string().oneOf(['message', 'malformedRequest', 'error', 'stream']).required(),
    data: yup.mixed<SocketRpcResponse | SocketRpcError | SocketRpcStream>().required(),
  })
  .required()

export const SocketRpcErrorSchema: yup.ObjectSchema<SocketRpcError> = yup
  .object({
    code: yup.string().defined(),
    message: yup.string().defined(),
    stack: yup.string().notRequired(),
  })
  .defined()

export const SocketRpcRequestSchema: yup.ObjectSchema<SocketRpcRequest> = yup
  .object({
    mid: yup.number().required(),
    type: yup.string().required(),
    auth: yup.string().nullable().notRequired(),
    data: yup.mixed().notRequired(),
  })
  .required()

export const SocketRpcResponseSchema: yup.ObjectSchema<SocketRpcResponse> = yup
  .object({
    id: yup.number().defined(),
    status: yup.number().defined(),
    data: yup.mixed().notRequired(),
  })
  .defined()

export const SocketRpcStreamSchema: yup.ObjectSchema<SocketRpcStream> = yup
  .object({
    id: yup.number().defined(),
    data: yup.mixed().notRequired(),
  })
  .defined()
