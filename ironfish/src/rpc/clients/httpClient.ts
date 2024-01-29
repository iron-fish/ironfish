/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Axios, { AxiosInstance, CancelTokenSource } from 'axios'
import http from 'http'
import { v4 as uuid } from 'uuid'
import * as yup from 'yup'
import { ErrorUtils, PromiseUtils, YupUtils } from '../../utils'
import { RpcHttpErrorSchema, RpcHttpResponseSchema } from '../adapters/httpAdapter'
import { RpcClient } from '../clients/client'
import { MessageBuffer } from '../messageBuffer'
import { isRpcResponseError, RpcResponse } from '../response'
import { Stream } from '../stream'
import {
  RpcConnectionLostError,
  RpcConnectionRefusedError,
  RpcRequestError,
  RpcRequestTimeoutError,
} from './errors'

export const RpcHttpMessageSchema = yup
  .object({
    status: yup.number().optional(),
  })
  .required()

export class RpcHttpClient extends RpcClient {
  protected readonly axios: AxiosInstance
  protected readonly requests = new Map<string, CancelTokenSource>()

  constructor(baseURL: string) {
    super()
    this.axios = Axios.create({ baseURL })
  }

  request<TEnd = unknown, TStream = unknown>(
    route: string,
    data?: unknown,
    options: {
      timeoutMs?: number | null
    } = {},
  ): RpcResponse<TEnd, TStream> {
    const requestId = uuid()

    const abort = Axios.CancelToken.source()
    const timeoutMs = options.timeoutMs ?? 0
    const messageBuffer = new MessageBuffer('\f')
    const [promise, resolve, reject] = PromiseUtils.split<TEnd>()
    const stream = new Stream<TStream>()
    const rpcResponse = new RpcResponse<TEnd, TStream>(promise, stream)

    this.requests.set(requestId, abort)

    const onData = async (data: Buffer): Promise<void> => {
      messageBuffer.write(data)

      for (const message of messageBuffer.readMessages()) {
        const parsed: unknown = JSON.parse(message)

        const { result, error } = await YupUtils.tryValidate(RpcHttpMessageSchema, parsed)

        if (!result) {
          throw error
        }

        if (result.status) {
          rpcResponse.status = result.status
        }

        if (isRpcResponseError(rpcResponse as RpcResponse<unknown, unknown>)) {
          const { result: errorBody, error: errorError } = await YupUtils.tryValidate(
            RpcHttpErrorSchema,
            parsed,
          )

          if (errorBody) {
            const err = new RpcRequestError(
              rpcResponse,
              errorBody.code,
              errorBody.message,
              errorBody.stack,
            )
            this.requests.delete(requestId)
            stream.close(err)
            reject(err)
          } else if (errorError) {
            this.requests.delete(requestId)
            stream.close(errorError)
            reject(errorError)
          } else {
            this.requests.delete(requestId)
            stream.close(data)
            reject(data)
          }
          return
        }

        const { result: messageBody, error: messageError } = await YupUtils.tryValidate(
          RpcHttpResponseSchema,
          parsed,
        )

        if (messageError) {
          throw messageError
        }

        if (result.status !== undefined) {
          this.requests.delete(requestId)
          stream.close()
          resolve(messageBody.data as TEnd)
          return
        }

        stream.write(messageBody.data as TStream)
      }
    }

    const body = JSON.stringify(data)

    void this.axios
      .post<http.IncomingMessage>(route, body, {
        responseType: 'stream',
        timeout: timeoutMs,
        cancelToken: abort.token,
        validateStatus: () => true,
        transitional: {
          clarifyTimeoutError: true,
          forcedJSONParsing: true,
          silentJSONParsing: true,
        },
      })
      .then((response) => {
        response.data.on('data', (data: Buffer) => {
          void onData(data)
        })

        response.data.on('end', () => {
          void onData(Buffer.from('\f'))
        })
      })
      .catch((error) => {
        if (error instanceof Axios.Cancel) {
          const errorTimeout = new RpcConnectionLostError(error.message)
          this.requests.delete(requestId)
          stream.close()
          reject(errorTimeout)
          return
        }

        if (ErrorUtils.isConnectTimeOutError(error)) {
          const errorTimeout = new RpcRequestTimeoutError(rpcResponse, timeoutMs, route)
          this.requests.delete(requestId)
          stream.close(errorTimeout)
          reject(errorTimeout)
          return
        }

        if (ErrorUtils.isConnectRefusedError(error)) {
          const errorRefused = new RpcConnectionRefusedError(`Failed to connect to ${route}`)
          this.requests.delete(requestId)
          stream.close(errorRefused)
          reject(errorRefused)
          return
        }

        this.requests.delete(requestId)
        stream.close(error)
        reject(error)
      })

    return rpcResponse
  }

  close(): void {
    const requests = Array.from(this.requests.values())
    this.requests.clear()

    for (const abort of requests) {
      abort.cancel('Closing HTTP Client')
    }
  }
}
