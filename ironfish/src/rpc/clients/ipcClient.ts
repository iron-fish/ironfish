/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IPC, IpcClient } from 'node-ipc'
import { Assert } from '../../assert'
import { createRootLogger, Logger } from '../../logger'
import { ErrorUtils } from '../../utils'
import { IpcRequest } from '../adapters'
import { ConnectionRefusedError } from './errors'
import { IronfishRpcClient } from './rpcClient'

const CONNECT_RETRY_MS = 2000

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
  connectionMode: string | undefined
  connection: Partial<IpcClientConnectionInfo>
  retryConnect: boolean
  constructor(
    connection: Partial<IpcClientConnectionInfo> = {},
    logger: Logger = createRootLogger(),
    retryConnect = false,
  ) {
    super(logger.withTag('ipcclient'))
    this.connection = connection
    this.retryConnect = retryConnect
    this.connectionMode = connection.mode
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

  close(): void {
    if (this.isConnected) {
      this.ipc?.disconnect('server')
      this.ipc = null
      this.isConnected = false
    }
  }

  send(messageId: number, route: string, data: unknown): void {
    Assert.isNotNull(this.client)
    const message: IpcRequest = {
      mid: messageId,
      type: route,
      data: data,
    }
    this.client.emit('message', message)
  }
}
