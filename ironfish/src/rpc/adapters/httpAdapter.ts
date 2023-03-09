/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import http from 'http'
import { v4 as uuid } from 'uuid'
import { Assert } from '../../assert'
import { createRootLogger, Logger } from '../../logger'
import { ErrorUtils } from '../../utils'
import { RpcRequest } from '../request'
import { ApiNamespace, Router } from '../routes'
import { RpcServer } from '../server'
import { IRpcAdapter } from './adapter'
import { ERROR_CODES, ResponseError } from './errors'

const MEGABYTES = 1000 * 1000
const MAX_REQUEST_SIZE = 5 * MEGABYTES

export type HttpRpcError = {
  status: number
  code: string
  message: string
  stack?: string
}

export class RpcHttpAdapter implements IRpcAdapter {
  server: http.Server | null = null
  router: Router | null = null

  readonly host: string
  readonly port: number
  readonly logger: Logger
  readonly namespaces: ApiNamespace[]
  private requests: Map<
    string,
    {
      rpcRequest?: RpcRequest
      req: http.IncomingMessage
    }
  >

  constructor(
    host: string,
    port: number,
    logger: Logger = createRootLogger(),
    namespaces: ApiNamespace[],
  ) {
    this.host = host
    this.port = port
    this.logger = logger
    this.namespaces = namespaces
    this.requests = new Map()
  }

  attach(server: RpcServer): void | Promise<void> {
    this.router = server.getRouter(this.namespaces)
  }

  start(): Promise<void> {
    this.logger.debug(`Serving RPC on HTTP ${this.host}:${this.port}`)

    const server = http.createServer()
    this.server = server

    return new Promise((resolve, reject) => {
      const onError = (err: unknown) => {
        server.off('error', onError)
        server.off('listening', onListening)
        reject(err)
      }

      const onListening = () => {
        server.off('error', onError)
        server.off('listening', onListening)

        server.on('request', (req, res) => {
          const requestId = uuid()
          this.requests.set(requestId, { req })

          req.on('close', () => {
            this.cleanUpRequest(requestId)
          })

          void this.handleRequest(req, res, requestId).catch((e) => {
            const error = ErrorUtils.renderError(e)
            this.logger.debug(`Error in HTTP adapter: ${error}`)
            let errorResponse: HttpRpcError = {
              code: ERROR_CODES.ERROR,
              status: 500,
              message: error,
            }

            if (e instanceof ResponseError) {
              errorResponse = {
                code: e.code,
                status: e.status,
                message: e.message,
                stack: e.stack,
              }
            }

            res.writeHead(errorResponse.status)
            res.end(JSON.stringify(errorResponse))

            this.cleanUpRequest(requestId)
          })
        })

        resolve()
      }

      server.on('error', onError)
      server.on('listening', onListening)
      server.listen(this.port, this.host)
    })
  }

  async stop(): Promise<void> {
    for (const { req, rpcRequest } of this.requests.values()) {
      req.destroy()
      rpcRequest?.close()
    }

    await new Promise<void>((resolve) => {
      this.server?.close(() => resolve()) || resolve()
    })
  }

  cleanUpRequest(requestId: string): void {
    const request = this.requests.get(requestId)

    // TODO: request.req was is already closed at this point
    // but do we need to clean that up here at all
    request?.rpcRequest?.close()
    this.requests.delete(requestId)
  }

  async handleRequest(
    request: http.IncomingMessage,
    response: http.ServerResponse,
    requestId: string,
  ): Promise<void> {
    if (this.router === null || this.router.server === null) {
      throw new ResponseError('Tried to connect to unmounted adapter')
    }

    const router = this.router

    if (request.url === undefined) {
      throw new ResponseError('No request url provided')
    }

    this.logger.debug(
      `Call HTTP RPC: ${request.method || 'undefined'} ${request.url || 'undefined'}`,
    )

    // TODO(daniel): better way to parse method from request here
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
    const route = url.pathname.substring(1)

    if (request.method !== 'POST') {
      throw new ResponseError(
        `Route does not exist, Did you mean to use POST?`,
        ERROR_CODES.ROUTE_NOT_FOUND,
        404,
      )
    }

    // TODO(daniel): clean up reading body code here a bit of possible
    let size = 0
    const data: Buffer[] = []

    for await (const chunk of request) {
      Assert.isInstanceOf(chunk, Buffer)
      size += chunk.byteLength
      data.push(chunk)

      if (size >= MAX_REQUEST_SIZE) {
        throw new ResponseError('Max request size exceeded')
      }
    }

    const combined = Buffer.concat(data)
    // TODO(daniel): some routes assume that no data will be passed as undefined
    // so keeping that convention here. Could think of a better way to handle?
    const body = combined.length ? combined.toString('utf8') : undefined

    const rpcRequest = new RpcRequest(
      body === undefined ? undefined : JSON.parse(body),
      route,
      (status: number, data?: unknown) => {
        response.writeHead(status, {
          'Content-Type': 'application/json',
        })
        response.end(JSON.stringify({ status, data }))
        this.cleanUpRequest(requestId)
      },
      (data: unknown) => {
        // TODO: see if this is correct way to implement HTTP streaming.
        // do more headers need to be set, etc.??
        const bufferData = Buffer.from(JSON.stringify(data))
        response.write(bufferData)
      },
    )

    this.requests.set(requestId, { rpcRequest, req: request })

    await router.route(route, rpcRequest)
  }
}
