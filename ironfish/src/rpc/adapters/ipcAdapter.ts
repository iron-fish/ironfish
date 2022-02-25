/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import { IPC, IpcServer, IpcSocket, IpcSocketId } from 'node-ipc'
import { v4 as uuid } from 'uuid'
import * as yup from 'yup'
import { Assert } from '../../assert'
import { createRootLogger, Logger } from '../../logger'
import { IronfishNode } from '../../node'
import { YupUtils } from '../../utils/yup'
import { Request } from '../request'
import { ApiNamespace, Router } from '../routes'
import { RpcServer } from '../server'
import { IAdapter } from './adapter'
import { ERROR_CODES, ResponseError } from './errors'

export type IpcRequest = {
  mid: number
  type: string
  data: unknown | undefined
}

export type IpcResponse = {
  id: number
  status: number
  data: unknown | undefined
}

export type IpcStream = {
  id: number
  data: unknown | undefined
}

export type IpcError = {
  code: string
  message: string
  stack?: string
}

export const IpcErrorSchema: yup.ObjectSchema<IpcError> = yup
  .object({
    code: yup.string().defined(),
    message: yup.string().defined(),
    stack: yup.string().notRequired(),
  })
  .defined()

export const IpcRequestSchema: yup.ObjectSchema<IpcRequest> = yup
  .object({
    mid: yup.number().required(),
    type: yup.string().required(),
    data: yup.mixed().notRequired(),
  })
  .required()

export const IpcResponseSchema: yup.ObjectSchema<IpcResponse> = yup
  .object({
    id: yup.number().defined(),
    status: yup.number().defined(),
    data: yup.mixed().notRequired(),
  })
  .defined()

export const IpcStreamSchema: yup.ObjectSchema<IpcStream> = yup
  .object({
    id: yup.number().defined(),
    data: yup.mixed().notRequired(),
  })
  .defined()

export type IpcAdapterConnectionInfo =
  | {
      mode: 'ipc'
      socketPath: string
    }
  | {
      mode: 'tcp'
      host: string
      port: number
    }

export class IpcAdapter implements IAdapter {
  node: IronfishNode | null = null
  router: Router | null = null
  ipc: IPC | null = null
  server: IpcServer | null = null
  namespaces: ApiNamespace[]
  logger: Logger
  pending = new Map<IpcSocketId, Request[]>()
  started = false
  connection: IpcAdapterConnectionInfo

  constructor(
    namespaces: ApiNamespace[],
    connection: IpcAdapterConnectionInfo,
    logger: Logger = createRootLogger(),
  ) {
    this.namespaces = namespaces
    this.connection = connection
    this.logger = logger.withTag('ipcadapter')
  }

  async start(): Promise<void> {
    if (this.started) {
      return
    }
    this.started = true

    const { IPC } = await import('node-ipc')
    const ipc = new IPC()
    ipc.config.silent = true
    ipc.config.rawBuffer = false
    this.ipc = ipc

    return new Promise((resolve, reject) => {
      const onServed = () => {
        const server = ipc.server
        this.server = server

        server.off('error', onError)

        server.on('connect', (socket: IpcSocket) => {
          this.onConnect(socket)
        })

        server.on('socket.disconnected', (socket) => {
          this.onDisconnect(socket, socket.id || null)
        })

        server.on('message', (data: unknown, socket: IpcSocket): void => {
          this.onMessage(socket, data).catch((err) => this.logger.error(err))
        })

        resolve()
      }

      const onError = (error?: unknown) => {
        ipc.server.off('error', onError)
        reject(error)
      }

      if (this.connection.mode === 'ipc') {
        this.logger.debug(`Serving RPC on IPC ${this.connection.socketPath}`)
        ipc.serve(this.connection.socketPath, onServed)
      } else if (this.connection.mode === 'tcp') {
        this.logger.debug(`Serving RPC on TCP ${this.connection.host}:${this.connection.port}`)
        ipc.serveNet(this.connection.host, this.connection.port, onServed)
      }

      ipc.server.on('error', onError)
      ipc.server.start()
    })
  }

  async stop(): Promise<void> {
    if (this.started && this.ipc) {
      this.ipc.server.stop()

      for (const socket of this.ipc.server.sockets) {
        Assert.isInstanceOf(socket, net.Socket)
        socket.destroy()
      }

      await this.waitForAllToDisconnect()
    }
  }

  async waitForAllToDisconnect(): Promise<void> {
    if (!this.server) {
      return
    }

    const promises = []

    for (const socket of this.server.sockets) {
      const promise = new Promise<void>((resolve) => {
        const onClose = () => {
          resolve()
          socket.off('close', onClose)
        }
        socket.on('close', onClose)
      })

      promises.push(promise)
    }

    await Promise.all(promises)
  }

  attach(server: RpcServer): void {
    this.node = server.node
    this.router = server.getRouter(this.namespaces)
  }

  unattach(): void {
    this.node = null
    this.router = null
  }

  onConnect(socket: IpcSocket): void {
    if (!socket.id) {
      socket.id = uuid()
    }
    this.logger.debug(`IPC client connected: ${socket.id}`)
  }

  onDisconnect(socket: IpcSocket, socketId: IpcSocketId | null): void {
    this.logger.debug(`IPC client disconnected: ${socketId ? socketId : 'unknown'}`)

    if (socketId !== null) {
      const pending = this.pending.get(socketId)

      if (pending) {
        for (const request of pending) {
          request.close()
        }
        this.pending.delete(socketId)
      }
    }
  }

  async onMessage(socket: IpcSocket, data: unknown): Promise<void> {
    if (!socket.id) {
      return
    }

    const result = await YupUtils.tryValidate(IpcRequestSchema, data)

    if (result.error) {
      this.handleMalformedRequest(socket, data)
      return
    }

    const message = result.result
    const node = this.node
    const router = this.router
    const server = this.server

    Assert.isNotNull(node)
    Assert.isNotNull(router)
    Assert.isNotNull(server)

    const request = new Request(
      message.data,
      node,
      (status: number, data?: unknown) => {
        this.emitResponse(socket, message.mid, status, data)
      },
      (data: unknown) => {
        this.emitStream(socket, message.mid, data)
      },
    )

    let pending = this.pending.get(socket.id)
    if (!pending) {
      pending = []
      this.pending.set(socket.id, pending)
    }

    pending.push(request)

    try {
      await router.route(message.type, request)
    } catch (error: unknown) {
      if (error instanceof ResponseError) {
        this.emitResponse(socket, message.mid, error.status, this.renderError(error))
      } else {
        throw error
      }
    }
  }

  emitResponse(socket: IpcSocket, messageId: number, status: number, data: unknown): void {
    Assert.isNotNull(this.server)
    this.server.emit(socket, 'message', { id: messageId, status: status, data: data })
  }

  emitStream(socket: IpcSocket, messageId: number, data: unknown): void {
    Assert.isNotNull(this.server)
    this.server.emit(socket, 'stream', { id: messageId, data: data })
  }

  renderError(error: unknown): IpcError {
    let message = 'An error has occured'
    let stack = undefined
    let code: string = ERROR_CODES.ERROR

    if (error instanceof Error) {
      message = error.message
      stack = error.stack
    }

    if (error instanceof ResponseError) {
      code = error.code
    }

    return {
      code: code,
      message: message,
      stack: stack,
    }
  }

  handleMalformedRequest(socket: IpcSocket, data: unknown): void {
    Assert.isNotNull(this.server)
    const error = this.renderError(new Error(`Malformed request rejected`))

    if (
      typeof data === 'object' &&
      data !== null &&
      'id' in data &&
      typeof (data as { id: unknown })['id'] === 'number'
    ) {
      const id = (data as { id: unknown })['id'] as number
      this.emitResponse(socket, id, 500, error)
      return
    }

    this.server.emit(socket, 'malformedRequest', error)
  }
}
