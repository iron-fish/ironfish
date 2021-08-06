/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRootLogger, Logger } from '../../logger'
import { IronfishNode } from '../../node'
import { MemoryAdapter } from '../adapters'
import { Response } from '../response'
import { IronfishRpcClient } from './rpcClient'

export class IronfishMemoryClient extends IronfishRpcClient {
  node: IronfishNode | null = null
  adapter: MemoryAdapter

  constructor(logger: Logger = createRootLogger()) {
    super(logger.withTag('memoryclient'))
    this.adapter = new MemoryAdapter()
  }

  async connect(node: IronfishNode): Promise<void> {
    if (node === this.node) {
      return
    }
    this.node = node
    await node.rpc.mount(this.adapter)
  }

  async disconnect(): Promise<void> {
    if (this.node) {
      await this.node.rpc.unmount(this.adapter)
    }
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
