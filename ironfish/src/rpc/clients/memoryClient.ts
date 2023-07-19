/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../assert'
import { Logger } from '../../logger'
import { IronfishNode } from '../../node'
import { MemoryResponse, RpcMemoryAdapter } from '../adapters'
import { ALL_API_NAMESPACES, Router } from '../routes'
import { RpcClient } from './client'

export class RpcMemoryClient extends RpcClient {
  _node: IronfishNode | null
  router: Router | null

  constructor(logger: Logger, node?: IronfishNode) {
    super(logger)

    if (node) {
      this.router = node.rpc.getRouter(ALL_API_NAMESPACES)
      this._node = node
    } else {
      this.router = null
      this._node = null
    }
  }

  setNode(node: IronfishNode): void {
    this.router = node.rpc.getRouter(ALL_API_NAMESPACES)
    this._node = node
  }

  request<TEnd = unknown, TStream = unknown>(
    route: string,
    data?: unknown,
    options: {
      timeoutMs?: number | null
    } = {},
  ): MemoryResponse<TEnd, TStream> {
    Assert.isNotNull(this.router)
    if (options.timeoutMs) {
      throw new Error(`MemoryAdapter does not support timeoutMs`)
    }

    return RpcMemoryAdapter.requestStream<TEnd, TStream>(this.router, route, data)
  }
}
