/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../assert'
import { PromiseUtils, SetTimeoutToken } from '../../utils'
import { RpcRequestError } from '../clients/errors'
import { RpcRequest } from '../request'
import { RpcResponse } from '../response'
import { Router } from '../routes'
import { Stream } from '../stream'
import { RpcResponseError } from './errors'

/**
 * This class provides a way to route requests directly against the routing layer
 * return a response from the route
 *
 * This is useful any time you want to make requests without hitting an IO layer.
 */
export class RpcMemoryAdapter {
  /**
   * Makes a request against the routing layer with a given route, and data and returns
   * a response for you to accumulate the streaming results, or wait for a response
   */
  static requestStream<TEnd = unknown, TStream = unknown>(
    router: Router,
    route: string,
    data?: unknown,
  ): MemoryResponse<TEnd, TStream> {
    const [promise, resolve, reject] = PromiseUtils.split<TEnd>()
    const stream = new Stream<TStream>()
    const response = new MemoryResponse(promise, stream, null)

    const request = new RpcRequest(
      data,
      route,
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

      if (e instanceof RpcResponseError) {
        // Set the response status to the errors status because RequsetError takes it from the response
        response.status = e.status

        const error = new RpcRequestError(response, e.code, e.message, e.stack)

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

export class MemoryResponse<TEnd, TStream> extends RpcResponse<TEnd, TStream> {
  request: RpcRequest<unknown, unknown> | null = null
  routePromise: Promise<void> | null = null

  constructor(
    promise: Promise<TEnd>,
    stream: Stream<TStream>,
    timeout: SetTimeoutToken | null,
  ) {
    super(promise, stream, timeout)
  }

  close(): void {
    Assert.isNotNull(this.request)
    this.request.close()
  }

  async waitForRoute(): Promise<MemoryResponse<TEnd, TStream>> {
    if (this.routePromise) {
      await this.routePromise
    }

    return this
  }
}
