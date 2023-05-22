/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio, { sizeVarint } from 'bufio'
import { Transaction } from '../../primitives/transaction'
import { NetworkMessageType } from '../types'
import { getTransactionSize, readTransaction, writeTransaction } from '../utils/serializers'
import { Direction, RpcNetworkMessage } from './rpcNetworkMessage'

export class GetBlockTransactionsRequest extends RpcNetworkMessage {
  readonly blockHash: Buffer
  readonly transactionIndexes: number[]

  constructor(blockHash: Buffer, transactionIndexes: number[], rpcId?: number) {
    super(NetworkMessageType.GetBlockTransactionsRequest, Direction.Request, rpcId)
    this.blockHash = blockHash
    this.transactionIndexes = transactionIndexes
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeHash(this.blockHash)

    bw.writeVarint(this.transactionIndexes.length)
    for (const transactionIndex of this.transactionIndexes) {
      bw.writeVarint(transactionIndex)
    }
  }

  static deserializePayload(buffer: Buffer, rpcId: number): GetBlockTransactionsRequest {
    const reader = bufio.read(buffer, true)
    const blockHash = reader.readHash()

    const transactionIndexesLength = reader.readVarint()
    const transactionIndexes = []
    for (let i = 0; i < transactionIndexesLength; i++) {
      const transactionIndex = reader.readVarint()
      transactionIndexes.push(transactionIndex)
    }

    return new GetBlockTransactionsRequest(blockHash, transactionIndexes, rpcId)
  }

  getSize(): number {
    let size = 0
    size += 32
    size += sizeVarint(this.transactionIndexes.length)
    for (const transactionIndex of this.transactionIndexes) {
      size += sizeVarint(transactionIndex)
    }
    return size
  }
}

export class GetBlockTransactionsResponse extends RpcNetworkMessage {
  readonly blockHash: Buffer
  readonly transactions: Transaction[]

  constructor(blockHash: Buffer, transactions: Transaction[], rpcId: number) {
    super(NetworkMessageType.GetBlockTransactionsResponse, Direction.Response, rpcId)
    this.blockHash = blockHash
    this.transactions = transactions
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeHash(this.blockHash)

    bw.writeVarint(this.transactions.length)
    for (const transaction of this.transactions) {
      writeTransaction(bw, transaction)
    }
  }

  static deserializePayload(buffer: Buffer, rpcId: number): GetBlockTransactionsResponse {
    const reader = bufio.read(buffer, true)
    const blockHash = reader.readHash()

    const transactionsLength = reader.readVarint()
    const transactions: Transaction[] = []
    for (let i = 0; i < transactionsLength; i++) {
      transactions.push(readTransaction(reader))
    }

    return new GetBlockTransactionsResponse(blockHash, transactions, rpcId)
  }

  getSize(): number {
    let size = 0
    size += 32
    size += sizeVarint(this.transactions.length)
    for (const transaction of this.transactions) {
      size += getTransactionSize(transaction)
    }
    return size
  }
}
