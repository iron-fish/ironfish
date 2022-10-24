/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Event } from '../event'

export class RpcRequest<TRequest = unknown, TResponse = unknown> {
  data: TRequest
  route: string
  ended = false
  closed = false
  onEnd: (status: number, data?: TResponse) => void
  onStream: (data?: TResponse) => void
  onClose = new Event<[]>()

  constructor(
    data: TRequest,
    route: string,
    onEnd: (status: number, data?: unknown) => void,
    onStream: (data?: unknown) => void,
  ) {
    this.data = data
    this.route = route
    this.onEnd = onEnd
    this.onStream = onStream
  }

  end(data?: TResponse, status?: number): void {
    if (this.ended) {
      throw new Error(`Request has already ended`)
    }
    this.ended = true
    if (this.closed) {
      return
    }
    this.onClose.clear()
    this.onEnd(status || 200, data)
  }

  stream(data: TResponse): void {
    if (this.closed) {
      return
    }
    if (this.ended) {
      throw new Error(`Request has already ended`)
    }
    this.onStream(data)
  }

  close(): void {
    this.closed = true
    this.onClose.emit()
  }
}
