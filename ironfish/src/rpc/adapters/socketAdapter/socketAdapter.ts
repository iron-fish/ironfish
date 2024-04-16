/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import fsAsync from 'fs/promises'
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
import { RPC_ERROR_CODES, RpcResponseError } from '../errors'
import {
  MESSAGE_DELIMITER,
  RpcSocketClientMessageSchema,
  RpcSocketError,
  RpcSocketServerMessage,
} from './protocol'

type RpcSocketClient = {
  id: string
  socket: net.Socket
  requests: Map<string, RpcRequest>
  messageBuffer: MessageBuffer
}

export abstract class RpcSocketAdapter implements IRpcAdapter {
  logger: Logger
  listen: net.ListenOptions
  server: net.Server | null = null
  router: Router | null = null
  namespaces: ApiNamespace[]
  enableAuthentication = true

  started = false
  clients = new Map<string, RpcSocketClient>()

  inboundTraffic = new Meter()
  outboundTraffic = new Meter()

  get addressPort(): number | null {
    const address = this.server?.address()
    if (!address) {
      return null
    }
    if (typeof address === 'string') {
      throw new Error('No unix sockets')
    }
    return address.port
  }

  constructor(
    listen: net.ListenOptions,
    logger: Logger = createRootLogger(),
    namespaces: ApiNamespace[],
  ) {
    this.listen = listen
    this.logger = logger.withTag('tcpadapter')
    this.namespaces = namespaces
  }

  protected createServer(): net.Server | Promise<net.Server> {
    return net.createServer((socket) => this.onClientConnection(socket))
  }

  async start(): Promise<void> {
    if (this.started) {
      return
    }
    this.started = true

    const server = await this.createServer()
    this.server = server

    this.inboundTraffic.start()
    this.outboundTraffic.start()

    if (this.listen.path) {
      await fsAsync.unlink(this.listen.path).catch(() => {
        // Unlink the IPC socket if it exists, but we don't care if it doesn't
      })

      if (process.platform === 'win32') {
        // Windows requires special socket paths. See this for more info:
        // https://nodejs.org/api/net.html#identifying-paths-for-ipc-connections
        if (this.listen.path && !this.listen.path.startsWith('\\\\.\\pipe\\')) {
          this.listen.path = this.listen.path.replace(/^\//, '')
          this.listen.path = this.listen.path.replace(/\//g, '-')
          this.listen.path = `\\\\.\\pipe\\${this.listen.path}`
        }
      }

      this.listen.readableAll = false
      this.listen.writableAll = false
    }

    return new Promise((resolve, reject) => {
      const onError = (err: unknown) => {
        server.off('error', onError)
        server.off('listening', onListening)
        reject(err)
      }

      const onListening = () => {
        server.off('error', onError)
        server.off('listening', onListening)
        resolve()
      }

      server.on('error', onError)
      server.on('listening', onListening)

      server.listen({
        ...this.listen,
        exclusive: true,
      })
    })
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return
    }

    this.started = false
    this.inboundTraffic.stop()
    this.outboundTraffic.stop()

    this.clients.forEach((client) => {
      client.requests.forEach((r) => r.close())
      client.socket.destroy()
      client.messageBuffer.clear()
    })

    await new Promise<void>((resolve) => {
      this.server?.close(() => resolve())
    })

    await this.waitForAllToDisconnect()

    this.logger.debug(`SocketAdapter stopped: ${this.describe()}`)
  }

  attach(server: RpcServer): void {
    this.router = server.getRouter(this.namespaces)
  }

  async waitForAllToDisconnect(): Promise<void> {
    const clients = Array.from(this.clients.values())
    await Promise.all(clients.map((c) => this.waitForClientToDisconnect(c)))
  }

  waitForClientToDisconnect(client: RpcSocketClient): Promise<void> {
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

  onClientDisconnection(client: RpcSocketClient): void {
    client.requests.forEach((req) => req.close())
    this.clients.delete(client.id)
    this.logger.debug(`client connection closed: ${this.describe()}`)
  }

  onClientError(client: RpcSocketClient, error: unknown): void {
    this.logger.debug(`${this.describe()} has error: ${ErrorUtils.renderError(error)}`)
  }

  async onClientData(client: RpcSocketClient, data: Buffer): Promise<void> {
    this.inboundTraffic.add(data.byteLength)
    client.messageBuffer.write(data)

    for (const rpcMessage of client.messageBuffer.readMessages()) {
      const [parsed, error] = JSONUtils.tryParse(rpcMessage)
      if (error) {
        this.emitResponse(client, this.constructMalformedRequest(data))
        continue
      }

      const result = await YupUtils.tryValidate(RpcSocketClientMessageSchema, parsed)

      if (result.error) {
        this.emitResponse(client, this.constructMalformedRequest(parsed))
        continue
      }

      const message = result.result.data

      const requestId = uuid()
      const request = new RpcRequest(
        message.data,
        message.type,
        (status: number, data?: unknown) => {
          this.emitResponse(client, this.constructMessage(message.mid, status, data), requestId)
        },
        (data: unknown) => {
          this.emitStream(client, this.constructStream(message.mid, data))
        },
      )
      client.requests.set(requestId, request)

      try {
        if (this.router == null || this.router.server == null) {
          throw new RpcResponseError('Tried to connect to unmounted adapter')
        }

        // Authentication
        if (this.enableAuthentication) {
          const isAuthenticated = this.router.server.authenticate(message.auth)

          if (!isAuthenticated) {
            const error = message.auth
              ? 'Failed authentication'
              : 'Missing authentication token'
            throw new RpcResponseError(error, RPC_ERROR_CODES.UNAUTHENTICATED, 401)
          }
        }

        await this.router.route(message.type, request)
      } catch (error: unknown) {
        if (error instanceof RpcResponseError) {
          const response = this.constructMessage(message.mid, error.status, {
            code: error.code,
            message: error.message,
            stack: error.stack,
          })

          this.emitResponse(client, response, requestId)
          continue
        }

        throw error
      }
    }
  }

  emitResponse(
    client: RpcSocketClient,
    data: RpcSocketServerMessage,
    requestId?: string,
  ): void {
    const message = this.encodeMessage(data)
    client.socket.write(message)
    this.outboundTraffic.add(message.byteLength)

    if (requestId) {
      client.requests.get(requestId)?.close()
      client.requests.delete(requestId)
    }
  }

  emitStream(client: RpcSocketClient, data: RpcSocketServerMessage): void {
    const message = this.encodeMessage(data)
    client.socket.write(message)
    this.outboundTraffic.add(message.byteLength)
  }

  encodeMessage(data: RpcSocketServerMessage): Buffer {
    return Buffer.from(JSON.stringify(data) + MESSAGE_DELIMITER)
  }

  constructMessage(messageId: number, status: number, data: unknown): RpcSocketServerMessage {
    return {
      type: 'message',
      data: {
        id: messageId,
        status: status,
        data: data,
      },
    }
  }

  constructStream(messageId: number, data: unknown): RpcSocketServerMessage {
    return {
      type: 'stream',
      data: {
        id: messageId,
        data: data,
      },
    }
  }

  constructMalformedRequest(request: unknown): RpcSocketServerMessage {
    const error = new Error(`Malformed request rejected`)

    const data: RpcSocketError = {
      code: RPC_ERROR_CODES.ERROR,
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

  describe(): string {
    if (this.listen.path) {
      return this.listen.path
    }

    if (this.listen.host && this.listen.port) {
      return `${this.listen.host}:${this.listen.port}`
    }

    return 'invalid'
  }
}
