/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../assert'
import { PromiseUtils, SetTimeoutToken } from '../../utils'
import { RequestError } from '../clients/errors'
import { Request } from '../request'
import { Response, ResponseEnded } from '../response'
import { ALL_API_NAMESPACES, Router } from '../routes'
import { RpcServer } from '../server'
import { Stream } from '../stream'
import { IAdapter } from './adapter'
import { ResponseError } from './errors'

/**
 * This class provides a way to route requests directly against the routing layer
 * return a response from the route The two methods are `request` and `requestStream`
 *
 * This is useful any time you want to make requests without hitting an IO layer.
 */
export class MemoryAdapter implements IAdapter {
  server: RpcServer | null = null
  router: Router | null = null

  start(): Promise<void> {
    return Promise.resolve()
  }

  stop(): Promise<void> {
    return Promise.resolve()
  }

  attach(server: RpcServer): void {
    this.server = server
    this.router = server.getRouter(ALL_API_NAMESPACES)
  }

  unattach(): void {
    this.server = null
    this.router = null
  }

  /**
   * Makes a request against the routing layer with a given route, and data and waits
   * for the response to end. This is used if you want to make a request against a route
   * that starts and ends and doesn't stream forever
   */
  async request<TEnd = unknown>(route: string, data?: unknown): Promise<ResponseEnded<TEnd>> {
    return this.requestStream<TEnd, unknown>(route, data).waitForEnd()
  }

  /**
   * Makes a request against the routing layer with a given route, and data and returns
   * a response for you to accumulate the streaming results, or wait for a response
   */
  requestStream<TEnd = unknown, TStream = unknown>(
    route: string,
    data?: unknown,
  ): MemoryResponse<TEnd, TStream> {
    const router = this.router
    const server = this.server

    Assert.isNotNull(router)
    Assert.isNotNull(server)

    const [promise, resolve, reject] = PromiseUtils.split<TEnd>()
    const stream = new Stream<TStream>()
    const response = new MemoryResponse(promise, stream, null)

    const request = new Request(
      data,
      server.node,
      (status: number, data?: unknown) => {
        response.status = status
        stream.close()
        resolve(data as TEnd)
      },
      (data: unknown) => {
        stream.write(data as TStream)
      },
    )

    response.request = request

    response.routePromise = router.route(route, request).catch((e) => {
      stream.close()

      if (e instanceof ResponseError) {
        // Set the response status to the errors status because RequsetError takes it from the response
        response.status = e.status

        const error = new RequestError(response, e.code, e.message, e.stack)

        // Do this so in memory requests retain the original stack and are easier to debug
        error.stack = error.codeStack ?? error.stack

        reject(error)
      } else {
        reject(e)
      }
    })

    return response
  }
}

export class MemoryResponse<TEnd, TStream> extends Response<TEnd, TStream> {
  request: Request<unknown, unknown> | null = null
  routePromise: Promise<void> | null = null

  constructor(
    promise: Promise<TEnd>,
    stream: Stream<TStream>,
    timeout: SetTimeoutToken | null,
  ) {
    super(promise, stream, timeout)
  }

  end(...args: Parameters<Request['end']>): ReturnType<Request['end']> {
    Assert.isNotNull(this.request)
    return this.request.end(args)
  }

  async waitForRoute(): Promise<MemoryResponse<TEnd, TStream>> {
    if (this.routePromise) {
      await this.routePromise
    }

    return this
  }
}
