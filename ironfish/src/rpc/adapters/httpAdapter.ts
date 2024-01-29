/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import http from 'http'
import { v4 as uuid } from 'uuid'
import * as yup from 'yup'
import { Assert } from '../../assert'
import { createRootLogger, Logger } from '../../logger'
import { Gauge, Meter } from '../../metrics'
import { ErrorUtils } from '../../utils'
import { RpcRequest } from '../request'
import { ApiNamespace, Router } from '../routes'
import { RpcServer } from '../server'
import { IRpcAdapter } from './adapter'
import { RPC_ERROR_CODES, RpcResponseError } from './errors'
import { MESSAGE_DELIMITER } from './socketAdapter'

const MEGABYTES = 1000 * 1000
const MAX_REQUEST_SIZE = 5 * MEGABYTES

export type RpcHttpError = {
  status: number
  code: string
  message: string
  stack?: string
}

export const RpcHttpErrorSchema: yup.ObjectSchema<RpcHttpError> = yup
  .object({
    status: yup.number().defined(),
    code: yup.string().defined(),
    message: yup.string().defined(),
    stack: yup.string().optional(),
  })
  .required()

export type RpcHttpResponse = {
  status?: number
  data: unknown
}

export const RpcHttpResponseSchema: yup.ObjectSchema<RpcHttpResponse> = yup
  .object({
    status: yup.number().optional(),
    data: yup.mixed().optional(),
  })
  .required()

export class RpcHttpAdapter implements IRpcAdapter {
  server: http.Server | null = null
  router: Router | null = null
  started = false

  readonly host: string
  readonly port: number
  readonly logger: Logger
  readonly namespaces: ApiNamespace[]
  readonly requests: Map<
    string,
    {
      rpcRequest?: RpcRequest
      req: http.IncomingMessage
      waitForClose: Promise<void>
    }
  >

  inboundTraffic = new Meter()
  outboundTraffic = new Meter()

  inboundBytes = new Gauge()
  outboundBytes = new Gauge()

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
    if (this.started) {
      return Promise.resolve()
    }

    this.started = true
    this.logger.debug(`Serving RPC on HTTP ${this.host}:${this.port}`)

    const server = http.createServer()
    this.server = server

    this.inboundTraffic.start()
    this.outboundTraffic.start()

    return new Promise((resolve, reject) => {
      const onError = (err: unknown) => {
        server.off('error', onError)
        server.off('listening', onListening)
        reject(err)
      }

      const onListening = () => {
        server.off('error', onError)
        server.off('listening', onListening)

        server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {
          this.onRequest(req, res)
        })

        resolve()
      }

      server.on('error', onError)
      server.on('listening', onListening)
      server.listen(this.port, this.host)
    })
  }

  onRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const requestId = uuid()

    const waitForClose = new Promise<void>((resolve) => {
      res.on('close', () => {
        this.cleanUpRequest(requestId)
        resolve()
      })
    })

    this.requests.set(requestId, { req, waitForClose })

    // All response bodies should be application/json
    res.setHeader('Content-Type', 'application/json')

    void this.handleRequest(req, res, requestId)
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return Promise.resolve()
    }

    this.started = false

    for (const { req, rpcRequest } of this.requests.values()) {
      req.destroy()
      rpcRequest?.close()
    }

    this.inboundTraffic.stop()
    this.outboundTraffic.stop()

    await new Promise<void>((resolve) => {
      this.server?.close(() => resolve()) || resolve()
    })

    await Promise.all(
      Array.from(this.requests.values()).map(({ waitForClose }) => waitForClose),
    )
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
    let chunkStreamed = false

    try {
      if (this.router === null || this.router.server === null) {
        throw new RpcResponseError('Tried to connect to unmounted adapter')
      }

      const router = this.router

      if (request.url === undefined) {
        throw new RpcResponseError('No request url provided')
      }

      this.logger.debug(
        `Call HTTP RPC: ${request.method || 'undefined'} ${request.url || 'undefined'}`,
      )

      const route = this.formatRoute(request)
      if (route === undefined) {
        throw new RpcResponseError('No route found')
      }

      // TODO(daniel): clean up reading body code here a bit of possible
      let size = 0
      const data: Buffer[] = []

      for await (const chunk of request) {
        Assert.isInstanceOf(chunk, Buffer)
        size += chunk.byteLength
        data.push(chunk)

        if (size >= MAX_REQUEST_SIZE) {
          throw new RpcResponseError('Max request size exceeded')
        }
      }

      const combined = Buffer.concat(data)

      this.inboundTraffic.add(size)
      this.inboundBytes.value += size

      // TODO(daniel): some routes assume that no data will be passed as undefined
      // so keeping that convention here. Could think of a better way to handle?
      const body = combined.length ? combined.toString('utf8') : undefined

      const rpcRequest = new RpcRequest(
        body === undefined ? undefined : JSON.parse(body),
        route,
        (status: number, data?: unknown) => {
          response.statusCode = status
          const delimiter = chunkStreamed ? MESSAGE_DELIMITER : ''

          const responseMessage: RpcHttpResponse = { status, data }
          const responseData = JSON.stringify(responseMessage)
          const responseSize = Buffer.byteLength(responseData, 'utf-8')
          this.outboundTraffic.add(responseSize)
          this.outboundBytes.value += responseSize

          response.end(delimiter + responseData)

          this.cleanUpRequest(requestId)
        },
        (data: unknown) => {
          // TODO: Most HTTP clients don't parse `Transfer-Encoding: chunked` by chunk
          // they wait until all chunks have been received and combine them. This will
          // stream a delimitated list of JSON objects but is still probably not
          // ideal as a response. We could find some better way to stream
          const delimiter = chunkStreamed ? MESSAGE_DELIMITER : ''

          const responseData = JSON.stringify({ data })
          const responseSize = Buffer.byteLength(responseData, 'utf-8')
          this.outboundTraffic.add(responseSize)
          this.outboundBytes.value += responseSize

          response.write(delimiter + responseData)
          chunkStreamed = true
        },
      )

      const currRequest = this.requests.get(requestId)
      currRequest && this.requests.set(requestId, { ...currRequest, rpcRequest })

      await router.route(route, rpcRequest)
    } catch (e) {
      const error = ErrorUtils.renderError(e)
      this.logger.debug(`Error in HTTP adapter: ${error}`)

      const responseMessage: RpcHttpError =
        e instanceof RpcResponseError
          ? {
              code: e.code,
              status: e.status,
              message: e.message,
              stack: e.stack,
            }
          : {
              code: RPC_ERROR_CODES.ERROR,
              status: 500,
              message: error,
            }

      // If we sent a streaming response we cannot send
      // headers again with the status
      if (!response.headersSent) {
        response.writeHead(responseMessage.status)
      }

      const delimiter = chunkStreamed ? MESSAGE_DELIMITER : ''

      const responseData = JSON.stringify(responseMessage)
      const responseSize = Buffer.byteLength(responseData, 'utf-8')
      this.outboundTraffic.add(responseSize)
      this.outboundBytes.value += responseSize

      response.end(delimiter + responseData)
      this.cleanUpRequest(requestId)
    }
  }

  // TODO(daniel): better way to parse method from request here
  formatRoute(request: http.IncomingMessage): string | undefined {
    if (!request.url) {
      return
    }
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
    return url.pathname.substring(1)
  }
}
