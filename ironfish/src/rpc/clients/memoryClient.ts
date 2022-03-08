/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../assert'
import { createRootLogger, Logger } from '../../logger'
import { IronfishNode } from '../../node'
import { MemoryAdapter } from '../adapters'
import { Response } from '../response'
import { IronfishRpcClient } from './rpcClient'

export class IronfishMemoryClient extends IronfishRpcClient {
  node: IronfishNode | null = null
  adapter: MemoryAdapter

  constructor(options?: { logger?: Logger; node?: IronfishNode }) {
    super((options?.logger ?? createRootLogger()).withTag('memoryclient'))

    this.adapter = new MemoryAdapter()
    this.node = options?.node ?? null
  }

  async connect(options?: { node: IronfishNode }): Promise<void> {
    if (options?.node === this.node) {
      return
    }

    if (options?.node) {
      this.node = options.node
    }

    Assert.isNotNull(this.node, 'Memory RPc client requires a node')
    await this.node.rpc.mount(this.adapter)
  }

  async close(): Promise<void> {
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
