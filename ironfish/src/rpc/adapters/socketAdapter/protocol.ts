/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'

export const MESSAGE_DELIMITER = '\f'

export type RpcSocketClientMessage = {
  type: 'message'
  data: RpcSocketRequest
}

export type RpcSocketServerMessage = {
  type: 'message' | 'malformedRequest' | 'error' | 'stream'
  data: RpcSocketResponse | RpcSocketError | RpcSocketStream
}

export type RpcSocketRequest = {
  mid: number
  type: string
  auth: string | null | undefined
  data: unknown
}

export type RpcSocketResponse = {
  id: number
  status: number
  data: unknown
}

export type RpcSocketStream = {
  id: number
  data: unknown
}

export type RpcSocketError = {
  code: string
  message: string
  stack?: string
}

export const RpcSocketClientMessageSchema: yup.ObjectSchema<RpcSocketClientMessage> = yup
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

export const RpcSocketServerMessageSchema: yup.ObjectSchema<RpcSocketServerMessage> = yup
  .object({
    type: yup.string().oneOf(['message', 'malformedRequest', 'error', 'stream']).required(),
    data: yup.mixed<RpcSocketResponse | RpcSocketError | RpcSocketStream>().required(),
  })
  .required()

export const RpcSocketErrorSchema: yup.ObjectSchema<RpcSocketError> = yup
  .object({
    code: yup.string().defined(),
    message: yup.string().defined(),
    stack: yup.string().notRequired(),
  })
  .defined()

export const RpcSocketRequestSchema: yup.ObjectSchema<RpcSocketRequest> = yup
  .object({
    mid: yup.number().required(),
    type: yup.string().required(),
    auth: yup.string().nullable().notRequired(),
    data: yup.mixed().notRequired(),
  })
  .required()

export const RpcSocketResponseSchema: yup.ObjectSchema<RpcSocketResponse> = yup
  .object({
    id: yup.number().defined(),
    status: yup.number().defined(),
    data: yup.mixed().notRequired(),
  })
  .defined()

export const RpcSocketStreamSchema: yup.ObjectSchema<RpcSocketStream> = yup
  .object({
    id: yup.number().defined(),
    data: yup.mixed().notRequired(),
  })
  .defined()
