/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../assert'
import { Logger } from '../../logger'
import { MemoryResponse, RpcMemoryAdapter } from '../adapters'
import { Router } from '../routes'
import { RpcClient } from './client'

export class RpcMemoryClient extends RpcClient {
  router?: Router

  constructor(logger: Logger, router?: Router) {
    super()
    this.router = router
  }

  request<TEnd = unknown, TStream = unknown>(
    route: string,
    data?: unknown,
    options: {
      timeoutMs?: number | null
    } = {},
  ): MemoryResponse<TEnd, TStream> {
    Assert.isNotUndefined(this.router)
    if (options.timeoutMs) {
      throw new Error(`MemoryAdapter does not support timeoutMs`)
    }

    return RpcMemoryAdapter.requestStream<TEnd, TStream>(this.router, route, data)
  }

  async close(): Promise<void> {
    await this.node.stopNode()
  }
}
