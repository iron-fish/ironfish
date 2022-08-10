/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import { v4 as uuid } from 'uuid'
import { createRootLogger, Logger } from '../../../logger'
import { Meter } from '../../../metrics/meter'
import { JSONUtils } from '../../../utils'
import { ErrorUtils } from '../../../utils/error'
import { YupUtils } from '../../../utils/yup'
import { MessageBuffer } from '../../messageBuffer'
import { RpcRequest } from '../../request'
import { ApiNamespace, Router } from '../../routes'
import { RpcServer } from '../../server'
import { IRpcAdapter } from '../adapter'
import { ERROR_CODES, ResponseError } from '../errors'
import {
  ClientSocketRpcSchema,
  MESSAGE_DELIMITER,
  ServerSocketRpc,
  SocketRpcError,
} from './protocol'

type SocketClient = {
  id: string
  socket: net.Socket
  requests: Map<string, RpcRequest>
  messageBuffer: MessageBuffer
}

export abstract class RpcSocketAdapter implements IRpcAdapter {
  logger: Logger
  host: string
  port: number
  server: net.Server | null = null
  router: Router | null = null
  namespaces: ApiNamespace[]

  started = false
  clients = new Map<string, SocketClient>()

  inboundTraffic = new Meter()
  outboundTraffic = new Meter()

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

  protected abstract createServer(): net.Server | Promise<net.Server>

  async start(): Promise<void> {
    if (this.started) {
      return
    }
    this.started = true

    const server = await this.createServer()
    this.server = server

    this.inboundTraffic.start()
    this.outboundTraffic.start()

    return new Promise((resolve, reject) => {
      server.on('error', (err) => {
        reject(err)
      })

      server.listen(
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

    this.inboundTraffic.stop()
    this.outboundTraffic.stop()

    this.clients.forEach((client) => {
      client.requests.forEach((r) => r.close())
      client.socket.destroy()
      client.messageBuffer.clear()
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

    this.logger.debug(`SocketAdapter stopped: ${this.host}:${this.port}`)
  }

  attach(server: RpcServer): void {
    this.router = server.getRouter(this.namespaces)
  }

  async waitForAllToDisconnect(): Promise<void> {
    const clients = Array.from(this.clients.values())
    await Promise.all(clients.map((c) => this.waitForClientToDisconnect(c)))
  }

  waitForClientToDisconnect(client: SocketClient): Promise<void> {
    return new Promise<void>((resolve) => {
      client.socket.once('close', () => {
        resolve()
      })
    })
  }

  onClientConnection(socket: net.Socket): void {
    const requests = new Map<string, RpcRequest>()
    const client = { socket, requests, id: uuid(), messageBuffer: new MessageBuffer() }
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

  onClientDisconnection(client: SocketClient): void {
    client.requests.forEach((req) => req.close())
    this.clients.delete(client.id)
    this.logger.debug(`client connection closed: ${this.host}:${this.port}`)
  }

  onClientError(client: SocketClient, error: unknown): void {
    this.logger.debug(`${this.host}:${this.port} has error: ${ErrorUtils.renderError(error)}`)
  }

  async onClientData(client: SocketClient, data: Buffer): Promise<void> {
    this.inboundTraffic.add(data.byteLength)
    client.messageBuffer.write(data)

    for (const rpcMessage of client.messageBuffer.readMessages()) {
      const [parsed, error] = JSONUtils.tryParse(rpcMessage)
      if (error) {
        this.emitResponse(client, this.constructMalformedRequest(data))
        return
      }

      const result = await YupUtils.tryValidate(ClientSocketRpcSchema, parsed)

      if (result.error) {
        this.emitResponse(client, this.constructMalformedRequest(parsed))
        return
      }

      const message = result.result.data

      const requestId = uuid()
      const request = new RpcRequest(
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
        this.emitResponse(client, this.constructUnmountedAdapter())
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
  }

  emitResponse(client: SocketClient, data: ServerSocketRpc, requestId?: string): void {
    const message = this.encodeNodeIpc(data)
    client.socket.write(message)
    this.outboundTraffic.add(message.byteLength)

    if (requestId) {
      client.requests.get(requestId)?.close()
      client.requests.delete(requestId)
    }
  }

  emitStream(client: SocketClient, data: ServerSocketRpc): void {
    const message = this.encodeNodeIpc(data)
    client.socket.write(message)
    this.outboundTraffic.add(message.byteLength)
  }

  // `constructResponse`,  `constructStream` and `constructMalformedRequest` construct messages to return
  // to a 'node-ipc' client. Once we remove 'node-ipc' we can return our own messages
  // The '\f' is for handling the delimeter that 'node-ipc' expects when parsing
  // messages it received. See 'node-ipc' parsing/formatting logic here:
  // https://github.com/RIAEvangelist/node-ipc/blob/master/entities/EventParser.js
  encodeNodeIpc(ipcResponse: ServerSocketRpc): Buffer {
    return Buffer.from(JSON.stringify(ipcResponse) + MESSAGE_DELIMITER)
  }

  constructMessage(messageId: number, status: number, data: unknown): ServerSocketRpc {
    return {
      type: 'message',
      data: {
        id: messageId,
        status: status,
        data: data,
      },
    }
  }

  constructStream(messageId: number, data: unknown): ServerSocketRpc {
    return {
      type: 'stream',
      data: {
        id: messageId,
        data: data,
      },
    }
  }

  constructMalformedRequest(request: unknown): ServerSocketRpc {
    const error = new Error(`Malformed request rejected`)

    const data: SocketRpcError = {
      code: ERROR_CODES.ERROR,
      message: error.message,
      stack: error.stack,
    }

    if (
      typeof request === 'object' &&
      request !== null &&
      'id' in request &&
      typeof (request as { id: unknown })['id'] === 'number'
    ) {
      const id = (request as { id: unknown })['id'] as number
      return this.constructMessage(id, 500, data)
    }

    return {
      type: 'malformedRequest',
      data: data,
    }
  }

  constructUnmountedAdapter(): ServerSocketRpc {
    const error = new Error(`Tried to connect to unmounted adapter`)

    const data: SocketRpcError = {
      code: ERROR_CODES.ERROR,
      message: error.message,
      stack: error.stack,
    }

    return {
      type: 'error',
      data: data,
    }
  }
}
