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

  // TODO(daniel): implement https + basic authentication with rpcToken

  constructor(host: string, port: number, logger: Logger, namespaces: ApiNamespace[]) {
    this.host = host
    this.port = port
    this.logger = logger
    this.namespaces = namespaces
    // TODO(daniel): do we need a max message size and what should it be?
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
      const onError = (err: unknown) => {
        server.off('error', onError)
        server.off('listening', onListening)
        reject(err)
      }

      const onListening = () => {
        server.off('error', onError)
        server.off('listening', onListening)

        // TODO(daniel): do we need to handle client error here too?
        // server.on('error', handleError) ???
        server.on('request', (req, res) => {
          void this.handleRequest(req, res).catch((e) => {
            const error = ErrorUtils.renderError(e)
            this.logger.debug(`Error in HTTP adapter: ${error}`)
            res.writeHead(500)
            res.end(JSON.stringify({ error }))
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
    // TODO(daniel): keep track of ongoing requests + message ids to close later
    throw new Error('Method not implemented.')
  }

  async handleRequest(
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ): Promise<void> {
    const router = this.router
    // TODO(daniel): get rid of asserts here or handle better
    Assert.isNotNull(router)
    Assert.isNotUndefined(request.url)

    this.logger.debug(
      `Call HTTP RPC: ${request.method || 'undefined'} ${request.url || 'undefined'}`,
    )

    // TODO(daniel): better way to parse method from request here
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
    const route = url.pathname.substring(1)

    if (request.method !== 'POST') {
      // TODO(daniel): better error here / support GET/PUT
      response.writeHead(404, `Route does not exist, Did you mean to use POST?`)
      response.end()
      return
    }

    // TODO(daniel): clean up reading body code here a bit of possible
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
