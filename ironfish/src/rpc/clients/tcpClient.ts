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
import { RpcConnectionRefusedError } from './errors'
import { RpcClientConnectionInfo, RpcSocketClient } from './socketClient'

export class RpcTcpClient extends RpcSocketClient {
  client: net.Socket | null = null
  protected readonly host: string
  protected readonly port: number
  private connectTimeout: SetTimeoutToken | null
  isConnected = false
  connection: RpcClientConnectionInfo
  private messageBuffer: MessageBuffer

  constructor(
    host: string,
    port: number,
    logger: Logger = createRootLogger(),
    authToken?: string,
  ) {
    super(logger.withTag('tcpclient'), authToken)
    this.host = host
    this.port = port
    this.connection = { mode: 'tcp', host: host, port: port }
    this.connectTimeout = null
    this.messageBuffer = new MessageBuffer()
  }

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

        if (ErrorUtils.isConnectRefusedError(error)) {
          reject(new RpcConnectionRefusedError())
        } else if (ErrorUtils.isNoEntityError(error)) {
          reject(new RpcConnectionRefusedError())
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
    this.client?.destroy()
    this.messageBuffer.clear()

    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout)
    }
  }

  protected send(messageId: number, route: string, data: unknown, authToken: string): void {
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

    if (this.client) {
      this.client.off('data', this.onClientData)
      this.client.off('close', this.onClientClose)
      this.client = null
    }

    this.handleClose()
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
