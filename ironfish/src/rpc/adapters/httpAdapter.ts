/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import http from 'http'
import { Assert } from '../../assert'
import { Logger } from '../../logger'
import { ErrorUtils } from '../../utils'
import { RpcRequest } from '../request'
import { ApiNamespace, Router } from '../routes'
import { RpcServer } from '../server'
import { IRpcAdapter } from './adapter'

export class RpcHttpAdapter implements IRpcAdapter {
  server: http.Server | null = null
  router: Router | null = null

  readonly host: string
  readonly port: number
  readonly logger: Logger
  readonly namespaces: ApiNamespace[]
  readonly maxRequestSize: number

  // TODO(daniel): keep track of ongoing requests + message ids
  // TODO(daniel): implement basic authentication with rpcToken
  // TODO(daniel): implement https??

  constructor(host: string, port: number, logger: Logger, namespaces: ApiNamespace[]) {
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

    //TODO(daniel): handle reject case here
    return new Promise((resolve, reject) => {
      const onError = (_error: unknown) => {
        server.off('onError', onError)
        server.off('listening', onListening)
      }

      const onListening = () => {
        server.off('onError', onError)
        server.off('listening', onListening)
        server.on('request', (req, res) => {
          this.logger.log('reqeust!')
          void this.onRequest(req, res).catch((e) => {
            //TODO(daniel): handle error better here
            res.writeHead(500, ErrorUtils.renderError(e))
            res.end()
          })
        })
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

  async onRequest(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    const router = this.router
    Assert.isNotNull(router)
    Assert.isNotUndefined(request.url)

    this.logger.info(`Call HTTP RPC: ${request.method || 'noMethod'} ${request.url || 'noUrl'}`)

    // TODO(daniel): better way to parse method from request here
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
    const route = url.pathname.substring(1)

    if (request.method !== 'POST') {
      // TODO(daniel): better error here / support GET/PUT
      response.writeHead(404, 'Route does not exist')
      response.end()
      return
    }

    // body TODO(daniel): clean up code here
    let size = 0
    const data: Buffer[] = []
    let body = ''

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
      // TODO(daniel): Yup validate here and respond with http error
      body = JSON.parse(combined.toString('utf8')) as string
    }

    const rpcRequest = new RpcRequest(
      body,
      route,
      (status: number, data?: unknown) => {
        response.writeHead(status, {
          'Content-Type': 'application/json',
        })
        response.end({ status, data: JSON.stringify(data) })
      },
      (data: unknown) => {
        // TODO: see if this is correct way to implement HTTP streaming.
        // do more headers need to be set, etc.??
        const bufferData = Buffer.from(JSON.stringify(data))
        response.write(bufferData)
      },
    )

    await router.route(route, rpcRequest)

    //TODO(daniel): figure out if this is correct way to handle closing reqeust
    rpcRequest.close()
  }
}
