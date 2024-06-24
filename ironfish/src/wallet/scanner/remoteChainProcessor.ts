/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../assert'
import { Event } from '../../event'
import { Logger } from '../../logger'
import { BlockHeader, Transaction } from '../../primitives'
import { RpcClient } from '../../rpc'
import {
  deserializeRpcBlockHeader,
  deserializeRpcTransaction,
} from '../../rpc/routes/chain/serializers'
import { BufferUtils } from '../../utils'

export class RemoteChainProcessor {
  hash: Buffer | null = null
  sequence: number | null = null
  logger: Logger
  nodeClient: RpcClient | null
  maxQueueSize: number

  onAdd = new Event<[{ header: BlockHeader; transactions: Transaction[] }]>()
  onRemove = new Event<[{ header: BlockHeader; transactions: Transaction[] }]>()

  constructor(options: {
    logger: Logger
    nodeClient: RpcClient | null
    head: Buffer | null
    maxQueueSize: number
  }) {
    this.logger = options.logger
    this.nodeClient = options.nodeClient
    this.hash = options.head
    this.maxQueueSize = options.maxQueueSize
  }

  async update({ signal }: { signal?: AbortSignal } = {}): Promise<{ hashChanged: boolean }> {
    Assert.isNotNull(this.nodeClient)

    const chainStream = this.nodeClient.chain.followChainStream({
      head: this.hash?.toString('hex') ?? null,
      serialized: true,
      wait: false,
      limit: this.maxQueueSize,
    })

    const oldHash = this.hash

    for await (const content of chainStream.contentStream()) {
      if (signal?.aborted) {
        return { hashChanged: !BufferUtils.equalsNullable(this.hash, oldHash) }
      }

      const { type, block } = content

      if (type === 'fork') {
        continue
      }

      const header = deserializeRpcBlockHeader(block)
      const transactions = block.transactions.map(deserializeRpcTransaction)

      if (type === 'connected') {
        this.hash = header.hash
        this.sequence = header.sequence

        await this.onAdd.emitAsync({ header, transactions })
      } else if (type === 'disconnected') {
        this.hash = header.previousBlockHash
        this.sequence = header.sequence - 1

        await this.onRemove.emitAsync({
          header: header,
          transactions: transactions,
        })
      }
    }

    const hashChanged = !BufferUtils.equalsNullable(this.hash, oldHash)
    return { hashChanged }
  }
}
