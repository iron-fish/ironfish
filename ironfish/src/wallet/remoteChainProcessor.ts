/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import { Event } from '../event'
import { Logger } from '../logger'
import { Transaction } from '../primitives'
import { FollowChainStreamResponse, RpcClient } from '../rpc'
import { BufferUtils } from '../utils'

export type WalletBlockHeader = {
  hash: Buffer
  previousBlockHash: Buffer
  sequence: number
  timestamp: Date
}

export type WalletBlockTransaction = {
  transaction: Transaction
  initialNoteIndex: number
}

export class RemoteChainProcessor {
  hash: Buffer | null = null
  sequence: number | null = null
  logger: Logger
  nodeClient: RpcClient | null
  maxQueueSize: number

  onAdd = new Event<[{ header: WalletBlockHeader; transactions: WalletBlockTransaction[] }]>()
  onRemove = new Event<
    [{ header: WalletBlockHeader; transactions: WalletBlockTransaction[] }]
  >()

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

      const blockHeader: WalletBlockHeader = {
        hash: Buffer.from(block.hash, 'hex'),
        previousBlockHash: Buffer.from(block.previous, 'hex'),
        sequence: block.sequence,
        timestamp: new Date(block.timestamp),
      }

      const blockTransactions = this.getBlockTransactions(content)

      if (type === 'connected') {
        this.hash = blockHeader.hash
        this.sequence = blockHeader.sequence
        await this.onAdd.emitAsync({ header: blockHeader, transactions: blockTransactions })
      } else if (type === 'disconnected') {
        this.hash = blockHeader.previousBlockHash
        this.sequence = blockHeader.sequence - 1
        await this.onRemove.emitAsync({
          header: blockHeader,
          transactions: blockTransactions,
        })
      }
    }

    return { hashChanged: !BufferUtils.equalsNullable(this.hash, oldHash) }
  }

  getBlockTransactions(response: FollowChainStreamResponse): WalletBlockTransaction[] {
    const transactions = []

    Assert.isNotNull(response.block.noteSize)
    let initialNoteIndex = response.block.noteSize

    for (const rpcTransaction of response.block.transactions.slice().reverse()) {
      Assert.isNotUndefined(rpcTransaction.serialized)
      const transaction = new Transaction(Buffer.from(rpcTransaction.serialized, 'hex'))
      initialNoteIndex -= transaction.notes.length

      transactions.push({
        transaction,
        initialNoteIndex,
      })
    }

    return transactions.slice().reverse()
  }
}
