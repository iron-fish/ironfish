/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import * as yup from 'yup'
import { createRootLogger, Logger } from '../../logger'
import { ErrorUtils, SetTimeoutToken, YupUtils } from '../../utils'
import { ConnectionRefusedError } from './errors'
import { IronfishRpcClient, RpcClientConnectionInfo } from './rpcClient'

const NODE_IPC_DELIMITER = '\f'
const CONNECT_RETRY_MS = 2000

type TcpResponse = {
  type: string
  data: unknown
}

const TcpResponseSchema: yup.ObjectSchema<TcpResponse> = yup
  .object({
    type: yup.string().oneOf(['message', 'malformedRequest', 'error', 'stream']).required(),
    data: yup.mixed().required(),
  })
  .required()

export class IronfishTcpClient extends IronfishRpcClient {
  readonly client: net.Socket
  private readonly host: string
  private readonly port: number
  private retryConnect: boolean
  private connectTimeout: SetTimeoutToken | null
  isConnected = false
  connection: RpcClientConnectionInfo

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
    this.client = new net.Socket()
    this.retryConnect = retryConnect
    this.connectTimeout = null
  }

  async connect(): Promise<void> {
    const connected = await this.connectClient()
      .then(() => true)
      .catch(() => false)

    if (!connected) {
      if (this.retryConnect) {
        this.logger.warn(
          `Failed to connect to ${String(this.host)}:${String(this.port)}, retrying`,
        )
        this.connectTimeout = setTimeout(() => void this.connect(), CONNECT_RETRY_MS)
        return
      }
      this.logger.warn(`Failed to connect to ${String(this.host)}:${String(this.port)}`)
    }
  }

  async connectClient(): Promise<void> {
    return new Promise((resolve, reject): void => {
      const onConnect = () => {
        this.client.off('connect', onConnect)
        this.client.off('error', onError)
        this.onConnect()
        resolve()
      }

      const onError = (error: unknown) => {
        this.client.off('connect', onConnect)
        this.client.off('error', onError)
        if (ErrorUtils.isConnectRefusedError(error)) {
          reject(new ConnectionRefusedError())
        } else if (ErrorUtils.isNoEntityError(error)) {
          reject(new ConnectionRefusedError())
        } else {
          reject(error)
        }
      }

      this.client.on('error', onError)
      this.client.on('connect', onConnect)
      this.logger.debug(`Connecting to ${String(this.host)}:${String(this.port)}`)
      this.client.connect(this.port, this.host)
    })
  }

  close(): void {
    this.client.end()

    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout)
    }
  }

  protected send(messageId: number, route: string, data: unknown): void {
    const message = {
      type: 'message',
      data: {
        mid: messageId,
        type: route,
        data: data,
      },
    }
    this.client.write(JSON.stringify(message) + NODE_IPC_DELIMITER)
  }

  protected onConnect(): void {
    this.isConnected = true
    this.client.on('data', this.onClientData)
    this.client.on('close', this.onClientClose)
  }

  protected onClientData = (data: Buffer): void =>
    void this.onData(data).catch((e) => this.onError(e))

  protected onData = async (data: Buffer): Promise<void> => {
    const events = data.toString('utf-8').trim().split(NODE_IPC_DELIMITER)
    for (const event of events) {
      const { result, error } = await YupUtils.tryValidate(TcpResponseSchema, JSON.parse(event))
      if (!result) {
        throw error
      }
      const { type, data }: TcpResponse = result
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
    this.client.off('data', this.onClientData)
    this.client.off('close', this.onClientClose)

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
