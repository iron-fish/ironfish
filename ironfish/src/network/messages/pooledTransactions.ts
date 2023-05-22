/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { Transaction, TransactionHash } from '../../primitives/transaction'
import { NetworkMessageType } from '../types'
import { getTransactionSize, readTransaction, writeTransaction } from '../utils/serializers'
import { Direction, RpcNetworkMessage } from './rpcNetworkMessage'

export class PooledTransactionsRequest extends RpcNetworkMessage {
  transactionHashes: TransactionHash[]

  constructor(transactionHashes: TransactionHash[], rpcId?: number) {
    super(NetworkMessageType.PooledTransactionsRequest, Direction.Request, rpcId)
    this.transactionHashes = transactionHashes
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeVarint(this.transactionHashes.length)

    for (const hash of this.transactionHashes) {
      bw.writeHash(hash)
    }
  }

  static deserializePayload(buffer: Buffer, rpcId: number): PooledTransactionsRequest {
    const reader = bufio.read(buffer, true)
    const transactionHashesLength = reader.readVarint()
    const transactionHashes = []

    for (let i = 0; i < transactionHashesLength; i++) {
      const hash = reader.readBytes(32)
      transactionHashes.push(hash)
    }

    return new PooledTransactionsRequest(transactionHashes, rpcId)
  }

  getSize(): number {
    let size = 0

    size += bufio.sizeVarint(this.transactionHashes.length)

    size += this.transactionHashes.length * 32

    return size
  }
}

export class PooledTransactionsResponse extends RpcNetworkMessage {
  transactions: Transaction[]

  constructor(transactions: Transaction[], rpcId?: number) {
    super(NetworkMessageType.PooledTransactionsResponse, Direction.Response, rpcId)
    this.transactions = transactions
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeVarint(this.transactions.length)

    for (const transaction of this.transactions) {
      writeTransaction(bw, transaction)
    }
  }

  static deserializePayload(buffer: Buffer, rpcId: number): PooledTransactionsResponse {
    const reader = bufio.read(buffer, true)
    const transactionsLength = reader.readVarint()
    const transactions: Transaction[] = []

    for (let i = 0; i < transactionsLength; i++) {
      const transaction = readTransaction(reader)
      transactions.push(transaction)
    }

    return new PooledTransactionsResponse(transactions, rpcId)
  }

  getSize(): number {
    let size = 0

    size += bufio.sizeVarint(this.transactions.length)

    for (const transaction of this.transactions) {
      size += getTransactionSize(transaction)
    }

    return size
  }
}
