/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IPC, IpcClient } from 'node-ipc'
import { Assert } from '../../assert'
import { Event } from '../../event'
import { createRootLogger, Logger } from '../../logger'
import { ErrorUtils, PromiseUtils, SetTimeoutToken, YupUtils } from '../../utils'
import { IpcErrorSchema, IpcRequest, IpcResponseSchema, IpcStreamSchema } from '../adapters'
import { isResponseError, Response } from '../response'
import { Stream } from '../stream'
import {
  ConnectionError,
  ConnectionLostError,
  ConnectionRefusedError,
  RequestError,
  RequestTimeoutError,
} from './errors'
import { IronfishRpcClient } from './rpcClient'

const CONNECT_RETRY_MS = 2000
const REQUEST_TIMEOUT_MS = null

export type IpcClientConnectionInfo =
  | {
      mode: 'ipc'
      socketPath: string
    }
  | {
      mode: 'tcp'
      host: string
      port: number
    }

export class IronfishIpcClient extends IronfishRpcClient {
  ipc: IPC | null = null
  ipcPath: string | null = null
  client: IpcClient | null = null
  isConnecting = false
  isConnected = false
  messageIds = 0
  timeoutMs: number | null = REQUEST_TIMEOUT_MS
  connection: Partial<IpcClientConnectionInfo>
  retryConnect: boolean

  onError = new Event<[error: unknown]>()
  onClose = new Event<[]>()

  pending = new Map<
    number,
    {
      response: Response<unknown>
      stream: Stream<unknown>
      timeout: SetTimeoutToken | null
      resolve: (message: unknown) => void
      reject: (error?: unknown) => void
      type: string
    }
  >()

  constructor(
    connection: Partial<IpcClientConnectionInfo> = {},
    logger: Logger = createRootLogger(),
    retryConnect = false,
  ) {
    super(logger.withTag('ipcclient'))
    this.connection = connection
    this.retryConnect = retryConnect
  }

  async connect(options?: {
    retryConnect?: boolean
    connection?: Partial<IpcClientConnectionInfo>
  }): Promise<void> {
    const retryConnect = options?.retryConnect ?? this.retryConnect
    const connection = { ...options?.connection, ...this.connection }

    if (connection.mode === 'ipc' && !connection.socketPath) {
      throw new Error('No IPC socket path given to connect to.')
    }

    if (connection.mode === 'tcp' && (!connection.host || !connection.port)) {
      throw new Error('No IPC socket path given to connect to.')
    }

    const { IPC } = await import('node-ipc')
    const ipc = new IPC()
    ipc.config.silent = true
    ipc.config.stopRetrying = !retryConnect
    ipc.config.retry = CONNECT_RETRY_MS
    this.ipc = ipc

    return new Promise<void>((resolve, reject) => {
      this.isConnecting = true

      const onConnectTo = () => {
        const client = ipc.of.server
        this.client = client

        const onConnect = () => {
          client.off('error', onError)
          client.off('connect', onConnect)
          this.isConnected = true
          this.isConnecting = false
          this.onConnect()
          resolve()
        }

        const onError = (error: unknown) => {
          if (client.retriesRemaining > 0 && !client.config.stopRetrying) {
            return
          }

          this.isConnecting = false
          client.off('error', onError)
          client.off('connect', onConnect)

          if (ErrorUtils.isConnectRefusedError(error)) {
            reject(new ConnectionRefusedError())
          } else if (ErrorUtils.isNoEntityError(error)) {
            reject(new ConnectionRefusedError())
          } else {
            reject(error)
          }
        }

        client.on('connect', onConnect)
        client.on('error', onError)
      }

      if (connection.mode === 'ipc') {
        this.logger.debug(`Connecting to ${String(connection.socketPath)}`)
        ipc.connectTo('server', connection.socketPath, onConnectTo)
      } else if (connection.mode === 'tcp') {
        this.logger.debug(`Connecting to ${String(connection.host)}:${String(connection.port)}`)
        ipc.connectToNet('server', connection.host, connection.port, onConnectTo)
      }
    })
  }

  /** Like IpcClient.connect but doesn't throw an error if we cannot connect */
  async tryConnect(): Promise<boolean> {
    return this.connect({ retryConnect: false })
      .then(() => true)
      .catch((e: unknown) => {
        if (e instanceof ConnectionError) {
          return false
        }
        throw e
      })
  }

  close(): void {
    if (this.isConnected) {
      this.ipc?.disconnect('server')
      this.ipc = null
      this.isConnected = false
    }
  }

  request<TEnd = unknown, TStream = unknown>(
    route: string,
    data?: unknown,
    options: {
      timeoutMs?: number | null
    } = {},
  ): Response<TEnd, TStream> {
    Assert.isNotNull(this.client, 'Connect first using IpcClient.connect()')

    const [promise, resolve, reject] = PromiseUtils.split<TEnd>()
    const messageId = ++this.messageIds
    const stream = new Stream<TStream>()
    const timeoutMs = options.timeoutMs === undefined ? this.timeoutMs : options.timeoutMs

    let timeout: SetTimeoutToken | null = null
    let response: Response<TEnd, TStream> | null = null

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

    response = new Response<TEnd, TStream>(promise, stream, timeout)

    const pending = {
      resolve: resolveRequest as (value: unknown) => void,
      reject: rejectRequest,
      timeout: timeout,
      response: response as Response<unknown>,
      stream: stream as Stream<unknown>,
      type: route,
    }

    this.pending.set(messageId, pending)

    const message: IpcRequest = {
      mid: messageId,
      type: route,
      data: data,
    }

    this.client.emit('message', message)

    return response
  }

  protected onConnect(): void {
    Assert.isNotNull(this.client)
    this.client.on('disconnect', this.onDisconnect)
    this.client.on('message', this.onMessage)
    this.client.on('malformedRequest', this.onMalformedRequest)
    this.client.on('stream', this.onStream)
    this.client.on('error', this.onClientError)
  }

  protected onDisconnect = (): void => {
    Assert.isNotNull(this.client)

    this.isConnected = false
    this.client.off('disconnect', this.onDisconnect)
    this.client.off('message', this.onMessage)
    this.client.off('malformedRequest', this.onMalformedRequest)
    this.client.off('stream', this.onStream)
    this.client.off('error', this.onClientError)
    this.client = null

    for (const request of this.pending.values()) {
      request.reject(new ConnectionLostError(request.type))
    }
    this.pending.clear()

    this.onClose.emit()
  }

  protected onClientError = (error: unknown): void => {
    this.onError.emit(error)
  }

  protected onMessage = (data: unknown): void => {
    this.handleEnd(data).catch((e) => this.onError.emit(e))
  }

  protected onStream = (data: unknown): void => {
    this.handleStream(data).catch((e) => this.onError.emit(e))
  }

  protected onMalformedRequest = (error: unknown): void => {
    this.onError.emit(error)
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

    if (isResponseError(pending.response)) {
      const { result: errorBody, error: errorError } = await YupUtils.tryValidate(
        IpcErrorSchema,
        result.data,
      )

      if (errorBody) {
        pending.reject(
          new RequestError(
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
