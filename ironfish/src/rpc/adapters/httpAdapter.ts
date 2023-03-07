/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import http from 'http'
import { Assert } from '../../assert'
import { createRootLogger, Logger } from '../../logger'
import { RpcRequest } from '../request'
import { ApiNamespace, Router } from '../routes'
import { RpcServer } from '../server'
import { IRpcAdapter } from './adapter'
import { ResponseError } from './errors'

export class RpcHttpAdapter implements IRpcAdapter {
  server: http.Server | null = null
  router: Router | null = null

  readonly host: string
  readonly port: number
  readonly logger: Logger
  readonly namespaces: ApiNamespace[]
  readonly maxRequestSize: number

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
    this.maxRequestSize = 5 * 1000 * 1000
  }

  attach(server: RpcServer): void | Promise<void> {
    this.router = server.getRouter(this.namespaces)
  }

  start(): Promise<void> {
    this.logger.debug(`Serving RPC on HTTP ${this.host}:${this.port}`)

    const server = http.createServer()
    this.server = server

    return new Promise((resolve, reject) => {
      const onError = (_error: unknown) => {
        server.off('onError', onError)
        server.off('listening', onListening)
      }

      const onListening = () => {
        server.off('onError', onError)
        server.off('listening', onListening)
        server.on('request', this.onRequest)
        resolve()
      }

      server.on('error', onError)
      server.on('listening', onListening)
      server.listen(this.port, this.host)
    })
  }

  stop(): Promise<void> {
    throw new Error('Method not implemented.')
  }

  onRequest = async (request: http.IncomingMessage, response: http.ServerResponse) => {
    const router = this.router
    Assert.isNotNull(router)

    this.logger.trace(`Call HTTP RPC: ${request.method} ${request.url}`)

    const headers = { 'Content-Type': 'application/json' }

    const url = new URL(`http://localhost${request.url}` || '')
    const route = url.pathname.substring(1)

    const content: Record<string, string> = {}

    // params
    if (url.search !== '') {
      params = {}
      for (const [key, value] of url.searchParams) {
        params[key] = value
      }
    }

    // body
    if (request.method === 'POST' || request.method === 'PUT') {
      let size = 0
      const data: Buffer[] = []

      for await (const chunk of request) {
        Assert.isInstanceOf(chunk, Buffer)
        size += chunk.byteLength
        data.push(chunk)

        if (size >= this.maxRequestSize) {
          response.writeHead(400, 'Max request size exceeded')
          return
        }
      }

      if (size > 0) {
        const combined = Buffer.concat(data)
        const parsed = JSON.parse(combined.toString('utf8'))
        Object.assign(content, parsed)
      }
    }

    const rpcRequest = new RpcRequest(
      content,
      route,
      (status: number, data?: unknown) => {
        response.writeHead(status, headers)
        response.write(JSON.stringify({ status: status, data: data }))
      },
      (_data: unknown) => {
        // Not supported in HTTP
      },
    )

    try {
      await router.route(route, rpcRequest)
    } catch (error: unknown) {
      if (error instanceof ResponseError) {
        response.writeHead(error.status, headers)
        response.write(
          JSON.stringify({
            code: error.code,
            message: error.message,
            stack: error.stack,
          }),
        )
        return
      }

      throw error
    } finally {
      response.end()
      rpcRequest.close()
    }
  }
}
