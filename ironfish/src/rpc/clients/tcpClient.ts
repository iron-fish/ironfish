/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import * as yup from 'yup'
import { createRootLogger, Logger } from '../../logger'
import { ErrorUtils, YupUtils } from '../../utils'
import { IpcErrorSchema, IpcResponseSchema, IpcStreamSchema, OutgoingNodeIpc } from '../adapters'
import { ConnectionRefusedError } from './errors'
import { IronfishRpcClient } from './rpcClient'

const NODE_IPC_DELIMITER = '\f'

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
  readonly host: string
  readonly port: number
  readonly client: net.Socket
  isConnected = false
  connectionMode: string | undefined = 'tcp'

  constructor(host: string, port: number, logger: Logger = createRootLogger()) {
    super(logger.withTag('tcpclient'))
    this.host = host
    this.port = port
    this.client = new net.Socket()
    this.client.on('data', (data) => void this.onData(data).catch((e) => this.onClientError(e)))
    this.client.on('close', this.onClientClose)
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject): void => {
      const onConnect = () => {
        this.client.off('connect', onConnect)
        this.client.off('error', onError)
        this.onConnect()
        this.isConnected = true
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
  }

  send(messageId: number, route: string, data: unknown): void {
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

  protected onData = async (data: Buffer): Promise<void> => {
    const events = data.toString('utf-8').trim().split(NODE_IPC_DELIMITER)
    for (const event of events) {
      const { type, data }: OutgoingNodeIpc = await this.tryValidateResponse(JSON.parse(event))
      this.client.emit(type, data)
    }
  }

  // Validates the response from the adapter in two steps
  // Yup does not support validation of union types, so we validate the data in the response based on the type
  protected async tryValidateResponse(response: string): Promise<OutgoingNodeIpc> {
    const { result, error } = await YupUtils.tryValidate(TcpResponseSchema, response)
    if (!result) {
      throw error
    }
    const { type, data }: TcpResponse = result
    switch (type) {
      case 'message': {
        const { result, error } = await YupUtils.tryValidate(IpcResponseSchema, data)
        if (!result) {
          throw error
        }
        return { type, data } as OutgoingNodeIpc
      }
      case 'malformedRequest': {
        const { result, error } = await YupUtils.tryValidate(IpcErrorSchema, data)
        if (!result) {
          throw error
        }
        return { type, data } as OutgoingNodeIpc
      }
      case 'error': {
        const { result, error } = await YupUtils.tryValidate(IpcErrorSchema, data)
        if (!result) {
          throw error
        }
        return { type, data } as OutgoingNodeIpc
      }
      case 'stream': {
        const { result, error } = await YupUtils.tryValidate(IpcStreamSchema, data)
        if (!result) {
          throw error
        }
        return { type, data } as OutgoingNodeIpc
      }
      default:
        throw yup.ValidationError
    }
  }

  protected onClientClose = (): void => {
    this.client.emit('disconnect')
    this.client.off('close', this.onClientClose)
  }
}
