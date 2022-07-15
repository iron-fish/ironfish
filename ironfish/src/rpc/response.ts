/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { SetTimeoutToken } from '../utils'
import { RpcConnectionLostError } from './clients'
import { Stream } from './stream'

export function isRpcResponseError(response: RpcResponse<unknown>): boolean {
  return isRpcResponseUserError(response) || isRpcResponseServerError(response)
}

export function isRpcResponseServerError(response: RpcResponse<unknown>): boolean {
  return response.status >= 500 && response.status <= 599
}

export function isRpcResponseUserError(response: RpcResponse<unknown>): boolean {
  return response.status >= 400 && response.status <= 499
}

export type RpcResponseEnded<TEnd> = Exclude<RpcResponse<TEnd>, 'content'> & { content: TEnd }

export class RpcResponse<TEnd = unknown, TStream = unknown> {
  private promise: Promise<TEnd>
  private stream: Stream<TStream>
  private timeout: SetTimeoutToken | null

  status = 0
  content: TEnd | null = null

  constructor(
    promise: Promise<TEnd>,
    stream: Stream<TStream>,
    timeout: SetTimeoutToken | null,
  ) {
    this.promise = promise
    this.stream = stream
    this.timeout = timeout
  }

  async waitForEnd(): Promise<RpcResponseEnded<TEnd>> {
    this.content = await this.promise
    return this as RpcResponseEnded<TEnd>
  }

  async *contentStream(ignoreClose = true): AsyncGenerator<TStream, void> {
    if (this.timeout) {
      clearTimeout(this.timeout)
    }

    for await (const value of this.stream) {
      yield value
    }

    await this.promise.catch((e) => {
      if (e instanceof RpcConnectionLostError && ignoreClose) {
        return
      }
      throw e
    })
  }
}
