/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '../../logger'
import { IronfishNode } from '../../node'
import { MemoryAdapter, MemoryResponse } from '../adapters'
import { ALL_API_NAMESPACES, Router } from '../routes'
import { IronfishClient } from './client'

export class IronfishMemoryClient extends IronfishClient {
  node: IronfishNode
  router: Router

  constructor(logger: Logger, node: IronfishNode) {
    super(logger)

    this.router = node.rpc.getRouter(ALL_API_NAMESPACES)
    this.node = node
  }

  request<TEnd = unknown, TStream = unknown>(
    route: string,
    data?: unknown,
    options: {
      timeoutMs?: number | null
    } = {},
  ): MemoryResponse<TEnd, TStream> {
    if (options.timeoutMs) {
      throw new Error(`MemoryAdapter does not support timeoutMs`)
    }

    return MemoryAdapter.requestStream<TEnd, TStream>(this.router, route, data)
  }
}
