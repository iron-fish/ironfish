/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '../../logger'
import { IronfishNode } from '../../node'
import { MemoryAdapter } from '../adapters'
import { Response } from '../response'
import { IronfishClient } from './client'

export class IronfishMemoryClient extends IronfishClient {
  node: IronfishNode
  adapter: MemoryAdapter

  constructor(logger: Logger, node: IronfishNode) {
    super(logger)

    const adapter = new MemoryAdapter(node.rpc)

    this.adapter = adapter
    this.node = node
  }

  request<TEnd = unknown, TStream = unknown>(
    route: string,
    data?: unknown,
    options: {
      timeoutMs?: number | null
    } = {},
  ): Response<TEnd, TStream> {
    if (options.timeoutMs) {
      throw new Error(`MemoryAdapter does not support timeoutMs`)
    }

    return this.adapter.requestStream<TEnd, TStream>(route, data)
  }
}
