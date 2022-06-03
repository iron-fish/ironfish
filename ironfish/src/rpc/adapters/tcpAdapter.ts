/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import { v4 as uuid } from 'uuid'
import * as yup from 'yup'
import { createRootLogger, Logger } from '../../logger'
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

export class TcpAdapter implements IAdapter {
  logger: Logger
  host: string
  port: number
  server: net.Server | null = null
  router: Router | null = null
  namespaces: ApiNamespace[]

  pending = new Map<string, { sock: net.Socket; reqs: Map<string, Request> }>()

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

  protected createServer(): net.Server {
    return net.createServer((socket) => this.onClientConnection(socket))
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.createServer()

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

  stop(): Promise<void> {
    this.logger.debug(`tcpAdapter stopped: ${this.host}:${this.port}`)
    this.pending.forEach(({ sock, reqs }) => {
      reqs.forEach((req) => {
        req.close()
      })
      sock.destroy()
    })
    return new Promise((resolve, reject) => {
      this.server?.close((error) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })
  }

  attach(server: RpcServer): void {
    this.router = server.getRouter(this.namespaces)
  }

  onClientConnection(socket: net.Socket): void {
    const connId = uuid()
    const reqMap = new Map<string, Request>()
    this.pending.set(connId, { sock: socket, reqs: reqMap })
    socket.on('data', (data) => {
      this.onClientData(socket, data, reqMap).catch((err) => this.logger.error(err))
    })
    socket.on('close', () => {
      // When the socket is closed, close all open requests and delete the connection
      reqMap.forEach((req) => req.close())
      this.pending.delete(connId)
      this.logger.debug(`client connection closed: ${this.host}:${this.port}`)
    })
    socket.on('error', (error: Error) => {
      this.logger.debug(`${this.host}:${this.port} has error : ${error.message}`)
    })
  }

  async onClientData(
    socket: net.Socket,
    data: Buffer,
    reqMap: Map<string, Request>,
  ): Promise<void> {
    const dataString = data.toString('utf8').trim()
    const result = await YupUtils.tryValidate(IncomingNodeIpcSchema, dataString)

    if (result.error) {
      this.emitResponse(socket, this.constructUnmountedAdapter(), reqMap)
      return
    }

    const message = result.result.data

    const reqId = uuid()
    const request = new Request(
      message.data,
      (status: number, data?: unknown) => {
        this.emitResponse(
          socket,
          this.constructMessage(message.mid, status, data),
          reqMap,
          reqId,
        )
      },
      (data: unknown) => {
        this.emitStream(socket, this.constructStream(message.mid, data))
      },
    )
    reqMap.set(reqId, request)

    if (this.router == null) {
      this.emitResponse(socket, this.constructMalformedRequest(data), reqMap)
      return
    }

    try {
      await this.router.route(message.type, request)
    } catch (error: unknown) {
      if (error instanceof ResponseError) {
        const res = this.constructMessage(message.mid, error.status, {
          code: error.code,
          message: error.message,
          stack: error.stack,
        })
        this.emitResponse(socket, res, reqMap, reqId)
        return
      }

      throw error
    }
  }

  emitResponse(
    socket: net.Socket,
    data: OutgoingNodeIpc,
    connMap: Map<string, Request>,
    reqId?: string,
  ): void {
    const res = this.encodeNodeIpc(data)
    socket.write(res)
    if (reqId) {
      connMap.get(reqId)?.close()
      connMap.delete(reqId)
    }
  }

  emitStream(socket: net.Socket, data: OutgoingNodeIpc): void {
    const res = this.encodeNodeIpc(data)
    socket.write(res)
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
