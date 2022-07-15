/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import { IpcClient } from 'node-ipc'
import { Assert } from '../../assert'
import { Event } from '../../event'
import { PromiseUtils, SetTimeoutToken, YupUtils } from '../../utils'
import { IpcErrorSchema, IpcResponseSchema, IpcStreamSchema } from '../adapters'
import { isRpcResponseError, RpcResponse } from '../response'
import { Stream } from '../stream'
import { RpcClient } from './client'
import { RequestTimeoutError, RpcConnectionError, RpcRequestError } from './errors'

const REQUEST_TIMEOUT_MS = null

export type RpcClientConnectionInfo =
  | {
      mode: 'ipc'
      socketPath: string
    }
  | {
      mode: 'tcp'
      host: string
      port: number
    }

export abstract class RpcSocketClient extends RpcClient {
  abstract client: IpcClient | net.Socket | null
  abstract isConnected: boolean
  abstract connection: Partial<RpcClientConnectionInfo>

  abstract connect(options?: Record<string, unknown>): Promise<void>
  abstract close(): void
  protected abstract send(messageId: number, route: string, data: unknown): void

  timeoutMs: number | null = REQUEST_TIMEOUT_MS
  messageIds = 0

  pending = new Map<
    number,
    {
      response: RpcResponse<unknown>
      stream: Stream<unknown>
      timeout: SetTimeoutToken | null
      resolve: (message: unknown) => void
      reject: (error?: unknown) => void
      type: string
    }
  >()

  onClose = new Event<[]>()

  async tryConnect(): Promise<boolean> {
    return this.connect()
      .then(() => true)
      .catch((e: unknown) => {
        if (e instanceof RpcConnectionError) {
          return false
        }
        throw e
      })
  }

  request<TEnd = unknown, TStream = unknown>(
    route: string,
    data?: unknown,
    options: {
      timeoutMs?: number | null
    } = {},
  ): RpcResponse<TEnd, TStream> {
    Assert.isNotNull(this.client, 'Connect first using connect()')

    const [promise, resolve, reject] = PromiseUtils.split<TEnd>()
    const messageId = ++this.messageIds
    const stream = new Stream<TStream>()
    const timeoutMs = options.timeoutMs === undefined ? this.timeoutMs : options.timeoutMs

    let timeout: SetTimeoutToken | null = null
    let response: RpcResponse<TEnd, TStream> | null = null

    if (timeoutMs !== null) {
      timeout = setTimeout(() => {
        const message = this.pending.get(messageId)

        if (message && response) {
          message.reject(new RequestTimeoutError(response, timeoutMs, route))
        }
      }, timeoutMs)
    }

    const resolveRequest = (...args: Parameters<typeof resolve>): void => {
      this.pending.delete(messageId)
      if (timeout) {
        clearTimeout(timeout)
      }
      stream.close()
      resolve(...args)
    }

    const rejectRequest = (...args: Parameters<typeof reject>): void => {
      this.pending.delete(messageId)
      if (timeout) {
        clearTimeout(timeout)
      }
      stream.close()
      reject(...args)
    }

    response = new RpcResponse<TEnd, TStream>(promise, stream, timeout)

    const pending = {
      resolve: resolveRequest as (value: unknown) => void,
      reject: rejectRequest,
      timeout: timeout,
      response: response as RpcResponse<unknown>,
      stream: stream as Stream<unknown>,
      type: route,
    }

    this.pending.set(messageId, pending)

    this.send(messageId, route, data)

    return response
  }

  protected handleStream = async (data: unknown): Promise<void> => {
    const { result, error } = await YupUtils.tryValidate(IpcStreamSchema, data)
    if (!result) {
      throw error
    }

    const pending = this.pending.get(result.id)
    if (!pending) {
      return
    }

    pending.stream.write(result.data)
  }

  protected handleEnd = async (data: unknown): Promise<void> => {
    const { result, error } = await YupUtils.tryValidate(IpcResponseSchema, data)
    if (!result) {
      throw error
    }

    const pending = this.pending.get(result.id)
    if (!pending) {
      return
    }

    pending.response.status = result.status

    if (isRpcResponseError(pending.response)) {
      const { result: errorBody, error: errorError } = await YupUtils.tryValidate(
        IpcErrorSchema,
        result.data,
      )

      if (errorBody) {
        pending.reject(
          new RpcRequestError(
            pending.response,
            errorBody.code,
            errorBody.message,
            errorBody.stack,
          ),
        )
      } else if (errorError) {
        pending.reject(errorError)
      } else {
        pending.reject(data)
      }
      return
    }

    pending.resolve(result.data)
  }
}
