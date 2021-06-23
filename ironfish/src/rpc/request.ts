/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Event } from '../event'
import { IronfishNode } from '../node'

export class Request<TRequest = unknown, TResponse = unknown> {
  data: TRequest
  node: IronfishNode
  ended = false
  closed = false
  code: number | null = null
  onEnd: (status: number, data?: TResponse) => void
  onStream: (data?: TResponse) => void
  onClose = new Event<[]>()

  constructor(
    data: TRequest,
    node: IronfishNode,
    onEnd: (status: number, data?: unknown) => void,
    onStream: (data?: unknown) => void,
  ) {
    this.data = data
    this.node = node
    this.onEnd = onEnd
    this.onStream = onStream
  }

  status(code: number): Request<TRequest, TResponse> {
    this.code = code
    return this
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
    this.onEnd(status || this.code || 200, data)
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
