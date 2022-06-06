/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import { v4 as uuid } from 'uuid'
import * as yup from 'yup'
import { createRootLogger, Logger } from '../../logger'
import { ErrorUtils } from '../../utils/error'
import { YupUtils } from '../../utils/yup'
import { Request } from '../request'
import { ApiNamespace, Router } from '../routes'
import { RpcServer } from '../server'
import { IAdapter } from './adapter'
import { ERROR_CODES, ResponseError } from './errors'
import { IpcError, IpcRequest, IpcResponse, IpcStream } from './ipcAdapter'

// Message type that node-ipc client sends over a TCP socket
type IncomingNodeIpc = {
  type: 'message'
  data: IpcRequest
}

// Message type that node-ipc client listens for over a TCP socket
type OutgoingNodeIpc =
  | { type: 'message'; data: IpcResponse }
  | { type: 'malformedRequest'; data: IpcError }
  | { type: 'error'; data: IpcError }
  | { type: 'stream'; data: IpcStream }

export const IncomingNodeIpcSchema: yup.ObjectSchema<IncomingNodeIpc> = yup
  .object({
    type: yup.string().oneOf(['message']).required(),
    data: yup
      .object({
        mid: yup.number().required(),
        type: yup.string().required(),
        data: yup.mixed().notRequired(),
      })
      .required(),
  })
  .required()

type TcpAdapterClient = {
  id: string
  socket: net.Socket
  requests: Map<string, Request>
}

export class TcpAdapter implements IAdapter {
  logger: Logger
  host: string
  port: number
  server: net.Server | null = null
  router: Router | null = null
  namespaces: ApiNamespace[]

  started = false
  clients = new Map<string, TcpAdapterClient>()

  constructor(
    host: string,
    port: number,
    logger: Logger = createRootLogger(),
    namespaces: ApiNamespace[],
  ) {
    this.host = host
    this.port = port
    this.logger = logger.withTag('tcpadapter')
    this.namespaces = namespaces
  }

  start(): Promise<void> {
    if (this.started) {
      return Promise.resolve()
    }
    this.started = true

    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => this.onClientConnection(socket))

      this.server.on('error', (err) => {
        reject(err)
      })

      this.server.listen(
        {
          host: this.host,
          port: this.port,
          exclusive: true,
        },
        () => {
          resolve()
        },
      )
    })
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return
    }

    this.clients.forEach((client) => {
      client.requests.forEach((r) => r.close())
      client.socket.destroy()
    })

    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })

    await this.waitForAllToDisconnect()

    this.logger.debug(`tcpAdapter stopped: ${this.host}:${this.port}`)
  }

  attach(server: RpcServer): void {
    this.router = server.getRouter(this.namespaces)
  }

  async waitForAllToDisconnect(): Promise<void> {
    const clients = Array.from(this.clients.values())
    await Promise.all(clients.map((c) => this.waitForClientToDisconnect(c)))
  }

  waitForClientToDisconnect(client: TcpAdapterClient): Promise<void> {
    return new Promise<void>((resolve) => {
      client.socket.once('close', () => {
        resolve()
      })
    })
  }

  onClientConnection(socket: net.Socket): void {
    const requests = new Map<string, Request>()
    const client = { socket, requests, id: uuid() }
    this.clients.set(client.id, client)

    socket.on('data', (data) => {
      this.onClientData(client, data).catch((e) => {
        this.onClientError(client, e)
      })
    })

    socket.on('close', () => {
      this.onClientDisconnection(client)
    })

    socket.on('error', (error: Error) => {
      this.onClientError(client, error)
    })
  }

  onClientDisconnection(client: TcpAdapterClient): void {
    client.requests.forEach((req) => req.close())
    this.clients.delete(client.id)
    this.logger.debug(`client connection closed: ${this.host}:${this.port}`)
  }

  onClientError(client: TcpAdapterClient, error: unknown): void {
    this.logger.debug(`${this.host}:${this.port} has error: ${ErrorUtils.renderError(error)}`)
  }

  async onClientData(client: TcpAdapterClient, data: Buffer): Promise<void> {
    const dataString = data.toString('utf8').trim()
    const result = await YupUtils.tryValidate(IncomingNodeIpcSchema, dataString)

    if (result.error) {
      this.emitResponse(client, this.constructUnmountedAdapter())
      return
    }

    const message = result.result.data

    const requestId = uuid()
    const request = new Request(
      message.data,
      (status: number, data?: unknown) => {
        this.emitResponse(client, this.constructMessage(message.mid, status, data), requestId)
      },
      (data: unknown) => {
        this.emitStream(client, this.constructStream(message.mid, data))
      },
    )
    client.requests.set(requestId, request)

    if (this.router == null) {
      this.emitResponse(client, this.constructMalformedRequest(data))
      return
    }

    try {
      await this.router.route(message.type, request)
    } catch (error: unknown) {
      if (error instanceof ResponseError) {
        const response = this.constructMessage(message.mid, error.status, {
          code: error.code,
          message: error.message,
          stack: error.stack,
        })

        this.emitResponse(client, response, requestId)
        return
      }

      throw error
    }
  }

  emitResponse(client: TcpAdapterClient, data: OutgoingNodeIpc, requestId?: string): void {
    const message = this.encodeNodeIpc(data)
    client.socket.write(message)

    if (requestId) {
      client.requests.get(requestId)?.close()
      client.requests.delete(requestId)
    }
  }

  emitStream(client: TcpAdapterClient, data: OutgoingNodeIpc): void {
    const message = this.encodeNodeIpc(data)
    client.socket.write(message)
  }

  // `constructResponse`,  `constructStream` and `constructMalformedRequest` construct messages to return
  // to a 'node-ipc' client. Once we remove 'node-ipc' we can return our own messages
  // The '\f' is for handling the delimeter that 'node-ipc' expects when parsing
  // messages it received. See 'node-ipc' parsing/formatting logic here:
  // https://github.com/RIAEvangelist/node-ipc/blob/master/entities/EventParser.js
  encodeNodeIpc(ipcResponse: OutgoingNodeIpc): string {
    return JSON.stringify(ipcResponse) + '\f'
  }

  constructMessage(messageId: number, status: number, data: unknown): OutgoingNodeIpc {
    return {
      type: 'message',
      data: {
        id: messageId,
        status: status,
        data: data,
      },
    }
  }

  constructStream(messageId: number, data: unknown): OutgoingNodeIpc {
    return {
      type: 'stream',
      data: {
        id: messageId,
        data: data,
      },
    }
  }

  constructMalformedRequest(data: unknown): OutgoingNodeIpc {
    const error = new Error(`Malformed request rejected`)
    const ipcError = {
      code: ERROR_CODES.ERROR,
      message: error.message,
      stack: error.stack,
    }

    if (
      typeof data === 'object' &&
      data !== null &&
      'id' in data &&
      typeof (data as { id: unknown })['id'] === 'number'
    ) {
      const id = (data as { id: unknown })['id'] as number
      return this.constructMessage(id, 500, ipcError)
    }

    return {
      type: 'malformedRequest',
      data: ipcError,
    }
  }

  constructUnmountedAdapter(): OutgoingNodeIpc {
    const error = new Error(`Tried to connect to unmounted adapter`)
    const ipcError = {
      code: ERROR_CODES.ERROR,
      message: error.message,
      stack: error.stack,
    }
    return {
      type: 'error',
      data: ipcError,
    }
  }
}
