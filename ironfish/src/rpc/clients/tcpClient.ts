/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import { Assert } from '../../assert'
import { createRootLogger, Logger } from '../../logger'
import { ErrorUtils, SetTimeoutToken, YupUtils } from '../../utils'
import {
  MESSAGE_DELIMITER,
  ServerSocketRpc,
  ServerSocketRpcSchema,
} from '../adapters/socketAdapter/protocol'
import { MessageBuffer } from '../messageBuffer'
import { ConnectionLostError, ConnectionRefusedError } from './errors'
import { IronfishRpcClient, RpcClientConnectionInfo } from './rpcClient'

const CONNECT_RETRY_MS = 2000

export class IronfishTcpClient extends IronfishRpcClient {
  client: net.Socket | null = null
  protected readonly host: string
  protected readonly port: number
  private retryConnect: boolean
  private connectTimeout: SetTimeoutToken | null
  isConnected = false
  connection: RpcClientConnectionInfo
  private messageBuffer: MessageBuffer

  constructor(
    host: string,
    port: number,
    logger: Logger = createRootLogger(),
    retryConnect = false,
  ) {
    super(logger.withTag('tcpclient'))
    this.host = host
    this.port = port
    this.connection = { mode: 'tcp', host: host, port: port }
    this.retryConnect = retryConnect
    this.connectTimeout = null
    this.messageBuffer = new MessageBuffer()
  }

  async connect(): Promise<void> {
    let connectionError: unknown
    const connected = await this.connectClient()
      .then(() => true)
      .catch((error) => {
        connectionError = error
        return false
      })

    if (!connected) {
      if (this.retryConnect) {
        this.logger.warn(
          `Failed to connect to ${String(this.host)}:${String(this.port)}, retrying`,
        )
        this.connectTimeout = setTimeout(() => void this.connect(), CONNECT_RETRY_MS)
        return
      }
      this.logger.error(`Failed to connect to ${String(this.host)}:${String(this.port)}`)
      throw connectionError
    }
  }

  async connectClient(): Promise<void> {
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
        if (ErrorUtils.isConnectRefusedError(error)) {
          reject(new ConnectionRefusedError())
        } else if (ErrorUtils.isNoEntityError(error)) {
          reject(new ConnectionRefusedError())
        } else {
          reject(error)
        }
      }

      this.logger.debug(`Connecting to ${String(this.host)}:${String(this.port)}`)
      const client = net.connect(this.port, this.host)
      client.on('error', onError)
      client.on('connect', onConnect)
      this.client = client
    })
  }

  close(): void {
    this.client?.end()

    this.messageBuffer.clear()
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout)
    }
  }

  protected send(messageId: number, route: string, data: unknown): void {
    Assert.isNotNull(this.client)
    const message = {
      type: 'message',
      data: {
        mid: messageId,
        type: route,
        data: data,
      },
    }
    this.client.write(JSON.stringify(message) + MESSAGE_DELIMITER)
  }

  protected onConnect(): void {
    Assert.isNotNull(this.client)
    this.isConnected = true
    this.client.on('data', this.onClientData)
    this.client.on('close', this.onClientClose)
  }

  protected onClientData = (data: Buffer): void =>
    void this.onData(data).catch((e) => this.onError(e))

  protected onData = async (data: Buffer): Promise<void> => {
    this.messageBuffer.write(data)

    for (const message of this.messageBuffer.readMessages()) {
      const { result, error } = await YupUtils.tryValidate(
        ServerSocketRpcSchema,
        JSON.parse(message),
      )
      if (!result) {
        throw error
      }
      const { type, data }: ServerSocketRpc = result
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
          this.onError(data)
          break
        }
      }
    }
  }

  protected onClientClose = (): void => {
    this.isConnected = false
    this.messageBuffer.clear()
    this.client?.off('data', this.onClientData)
    this.client?.off('close', this.onClientClose)

    for (const request of this.pending.values()) {
      request.reject(new ConnectionLostError(request.type))
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

  protected onError(error: unknown): void {
    this.logger.error(ErrorUtils.renderError(error))
  }
}
