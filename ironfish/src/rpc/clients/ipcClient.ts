/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IPC, IpcClient } from 'node-ipc'
import { Assert } from '../../assert'
import { Event } from '../../event'
import { createRootLogger, Logger } from '../../logger'
import { ErrorUtils } from '../../utils'
import { IpcRequest } from '../adapters'
import { RpcConnectionLostError, RpcConnectionRefusedError } from './errors'
import { RpcClientConnectionInfo, RpcSocketClient } from './socketClient'

const CONNECT_RETRY_MS = 2000

export class RpcIpcClient extends RpcSocketClient {
  ipc: IPC | null = null
  ipcPath: string | null = null
  client: IpcClient | null = null
  isConnected = false
  connection: Partial<RpcClientConnectionInfo>
  retryConnect: boolean

  onError = new Event<[error: unknown]>()

  constructor(
    connection: Partial<RpcClientConnectionInfo> = {},
    logger: Logger = createRootLogger(),
    retryConnect = false,
  ) {
    super(logger.withTag('ipcclient'))
    this.connection = connection
    this.retryConnect = retryConnect
  }

  async connect(options?: {
    retryConnect?: boolean
    connection?: Partial<RpcClientConnectionInfo>
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
      const onConnectTo = () => {
        const client = ipc.of.server
        this.client = client

        const onConnect = () => {
          client.off('error', onError)
          client.off('connect', onConnect)
          this.isConnected = true
          this.onConnect()
          resolve()
        }

        const onError = (error: unknown) => {
          if (client.retriesRemaining > 0 && !client.config.stopRetrying) {
            return
          }

          client.off('error', onError)
          client.off('connect', onConnect)

          if (ErrorUtils.isConnectRefusedError(error)) {
            reject(new RpcConnectionRefusedError())
          } else if (ErrorUtils.isNoEntityError(error)) {
            reject(new RpcConnectionRefusedError())
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

  close(): void {
    if (this.isConnected) {
      this.ipc?.disconnect('server')
      this.ipc = null
      this.isConnected = false
    }
  }

  protected send(messageId: number, route: string, data: unknown): void {
    Assert.isNotNull(this.client)
    const message: IpcRequest = {
      mid: messageId,
      type: route,
      data: data,
    }
    this.client.emit('message', message)
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
      request.reject(new RpcConnectionLostError(request.type))
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
}
