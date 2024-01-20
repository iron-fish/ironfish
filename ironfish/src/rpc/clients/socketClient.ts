/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import { Assert } from '../../assert'
import { Event } from '../../event'
import { Logger } from '../../logger'
import { ErrorUtils, PromiseUtils, SetTimeoutToken, YupUtils } from '../../utils'
import {
  MESSAGE_DELIMITER,
  RpcSocketErrorSchema,
  RpcSocketResponseSchema,
  RpcSocketServerMessage,
  RpcSocketServerMessageSchema,
  RpcSocketStreamSchema,
} from '../adapters'
import { MessageBuffer } from '../messageBuffer'
import { isRpcResponseError, RpcResponse } from '../response'
import { Stream } from '../stream'
import { RpcClient } from './client'
import {
  RpcConnectionError,
  RpcConnectionLostError,
  RpcConnectionRefusedError,
  RpcRequestError,
  RpcRequestTimeoutError,
} from './errors'

export type RpcSocketClientConnectionInfo = {
  path?: string
  host?: string
  port?: number
}

export abstract class RpcSocketClient extends RpcClient {
  readonly onClose = new Event<[]>()
  readonly connectTo: RpcSocketClientConnectionInfo
  readonly authToken: string | null = null
  readonly messageBuffer: MessageBuffer
  protected readonly logger: Logger

  client: net.Socket | null = null
  isConnected = false

  constructor(connectTo: RpcSocketClientConnectionInfo, logger: Logger, authToken?: string) {
    super()
    this.logger = logger
    this.connectTo = connectTo
    this.authToken = authToken ?? null
    this.messageBuffer = new MessageBuffer()
  }

  private timeoutMs: number | null = null
  private messageIds = 0

  private pending = new Map<
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

  async connect(): Promise<void> {
    return new Promise((resolve, reject): void => {
      const onConnect = () => {
        client.off('connect', onConnect)
        client.off('error', onError)
        this.onConnect()
        resolve()
      }

      const onError = (error: unknown) => {
        client.off('connect', onConnect)
        client.off('error', onError)

        if (ErrorUtils.isConnectRefusedError(error) || ErrorUtils.isNoEntityError(error)) {
          reject(new RpcConnectionRefusedError())
        } else if (
          ErrorUtils.isConnectTimeOutError(error) ||
          ErrorUtils.isConnectResetError(error)
        ) {
          reject(new RpcConnectionLostError())
        } else {
          reject(error)
        }
      }

      const options =
        this.connectTo.path !== undefined
          ? { path: this.connectTo.path }
          : this.connectTo.port !== undefined
          ? { port: this.connectTo.port, host: this.connectTo.host }
          : null

      Assert.isNotNull(options)

      if (process.platform === 'win32') {
        // Windows requires special socket paths. See this for more info:
        // https://nodejs.org/api/net.html#identifying-paths-for-ipc-connections
        if (options.path && !options.path.startsWith('\\\\.\\pipe\\')) {
          options.path = options.path.replace(/^\//, '')
          options.path = options.path.replace(/\//g, '-')
          options.path = `\\\\.\\pipe\\${options.path}`
        }
      }

      this.logger.debug(`Connecting to ${this.describe()}`)
      const client = net.connect(options)
      client.on('error', onError)
      client.on('connect', onConnect)
      this.client = client
    })
  }

  close(): void {
    this.client?.destroy()
    this.messageBuffer.clear()
  }

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
          message.reject(new RpcRequestTimeoutError(response, timeoutMs, route))
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
      stream.close(...args)
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

    this.send(messageId, route, data, this.authToken)

    return response
  }

  protected send(
    messageId: number,
    route: string,
    data: unknown,
    authToken: string | null,
  ): void {
    Assert.isNotNull(this.client)
    const message = {
      type: 'message',
      data: {
        mid: messageId,
        type: route,
        auth: authToken,
        data: data,
      },
    }
    this.client.write(JSON.stringify(message) + MESSAGE_DELIMITER)
  }

  protected handleStream = async (data: unknown): Promise<void> => {
    const { result, error } = await YupUtils.tryValidate(RpcSocketStreamSchema, data)
    if (!result) {
      throw error
    }

    const pending = this.pending.get(result.id)
    if (!pending) {
      return
    }

    pending.stream.write(result.data)
  }

  /*
   * Should be called by all implementers when the connection is closed by the other side (server).
   * This cleans up all the pending requests by rejecting them with a RpcConnectionLostError
   *
   * TODO: we should probably also have a cleanup function for when the client closes itself
   */
  protected handleClose = (): void => {
    for (const request of this.pending.values()) {
      request.reject(new RpcConnectionLostError(request.type))
    }

    this.pending.clear()
    this.onClose.emit()
  }

  protected handleEnd = async (data: unknown): Promise<void> => {
    const { result, error } = await YupUtils.tryValidate(RpcSocketResponseSchema, data)
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
        RpcSocketErrorSchema,
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

  protected onConnect(): void {
    Assert.isNotNull(this.client)
    this.isConnected = true
    this.client.on('data', this.onClientData)
    this.client.on('close', this.onClientClose)
    this.client.on('error', this.onSocketError)
  }

  protected onClientData = (data: Buffer): void =>
    void this.onData(data).catch((e) => this.onError(e)) // recoverable

  protected onData = async (data: Buffer): Promise<void> => {
    this.messageBuffer.write(data)

    for (const message of this.messageBuffer.readMessages()) {
      const { result, error } = await YupUtils.tryValidate(
        RpcSocketServerMessageSchema,
        JSON.parse(message),
      )
      if (!result) {
        throw error
      }
      const { type, data }: RpcSocketServerMessage = result
      switch (type) {
        case 'message': {
          this.onMessage(data)
          break
        }
        case 'stream': {
          this.onStream(data)
          break
        }
        case 'error':
        case 'malformedRequest': {
          this.onError(data) // recoverable
          break
        }
      }
    }
  }

  protected onClientClose = (): void => {
    this.isConnected = false
    this.messageBuffer.clear()

    if (this.client) {
      this.client.off('data', this.onClientData)
      this.client.off('close', this.onClientClose)
      this.client.off('error', this.onError)
      this.client = null
    }

    for (const request of this.pending.values()) {
      request.reject(new RpcConnectionLostError(request.type))
    }

    this.pending.clear()
    this.onClose.emit()
  }

  protected onMessage = (data: unknown): void => {
    this.handleEnd(data).catch((e) => this.onError(e))
  }

  protected onStream = (data: unknown): void => {
    this.handleStream(data).catch((e) => this.onError(e))
  }

  protected onError = (error: unknown): void => {
    this.logger.error(ErrorUtils.renderError(error))
  }

  protected onSocketError = (error: unknown): void => {
    this.logger.error(ErrorUtils.renderError(error))
    this.onClientClose()
  }

  describe(): string {
    if (this.connectTo.path !== undefined) {
      return `path: '${this.connectTo.path}'`
    }

    if (this.connectTo.host !== undefined && this.connectTo.port !== undefined) {
      return `${this.connectTo.host}:${this.connectTo.port}`
    }

    return 'invalid'
  }
}
