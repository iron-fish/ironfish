/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { SetTimeoutToken } from '../utils'
import { ConnectionLostError } from './clients'
import { Stream } from './stream'

export function isResponseError(response: Response<unknown>): boolean {
  return isResponseUserError(response) || isResponseServerError(response)
}

export function isResponseServerError(response: Response<unknown>): boolean {
  return response.status >= 500 && response.status <= 599
}

export function isResponseUserError(response: Response<unknown>): boolean {
  return response.status >= 400 && response.status <= 499
}

export type ResponseEnded<TEnd> = Exclude<Response<TEnd>, 'content'> & { content: TEnd }

export class Response<TEnd = unknown, TStream = unknown> {
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

  async waitForEnd(): Promise<ResponseEnded<TEnd>> {
    this.content = await this.promise
    return this as ResponseEnded<TEnd>
  }

  async *contentStream(ignoreClose = true): AsyncGenerator<TStream, void> {
    if (this.timeout) {
      clearTimeout(this.timeout)
    }

    for await (const value of this.stream) {
      yield value
    }

    await this.promise.catch((e) => {
      if (e instanceof ConnectionLostError && ignoreClose) {
        return
      }
      throw e
    })
  }
}
