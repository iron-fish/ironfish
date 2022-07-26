/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio, { sizeVarBytes, sizeVarint } from 'bufio'
import { NetworkMessageType } from '../types'
import { Direction, RpcNetworkMessage } from './rpcNetworkMessage'

export class GetBlockTransactionsRequest extends RpcNetworkMessage {
  readonly blockHash: Buffer
  readonly transactionIndexes: number[]

  constructor(blockHash: Buffer, transactionIndexes: number[], rpcId?: number) {
    super(NetworkMessageType.GetBlockTransactionsRequest, Direction.Request, rpcId)
    this.blockHash = blockHash
    this.transactionIndexes = transactionIndexes
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeHash(this.blockHash)

    bw.writeVarint(this.transactionIndexes.length)
    for (const transactionIndex of this.transactionIndexes) {
      bw.writeVarint(transactionIndex)
    }

    return bw.render()
  }

  static deserialize(buffer: Buffer, rpcId: number): GetBlockTransactionsRequest {
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
  readonly serializedTransactions: Buffer[]

  constructor(blockHash: Buffer, serializedTransactions: Buffer[], rpcId: number) {
    super(NetworkMessageType.GetBlockTransactionsResponse, Direction.Response, rpcId)
    this.blockHash = blockHash
    this.serializedTransactions = serializedTransactions
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeHash(this.blockHash)

    bw.writeVarint(this.serializedTransactions.length)
    for (const serializedTransaction of this.serializedTransactions) {
      bw.writeVarBytes(serializedTransaction)
    }

    return bw.render()
  }

  static deserialize(buffer: Buffer, rpcId: number): GetBlockTransactionsResponse {
    const reader = bufio.read(buffer, true)
    const blockHash = reader.readHash()

    const serializedTransactionsLength = reader.readVarint()
    const serializedTransactions = []
    for (let i = 0; i < serializedTransactionsLength; i++) {
      serializedTransactions.push(reader.readVarBytes())
    }

    return new GetBlockTransactionsResponse(blockHash, serializedTransactions, rpcId)
  }

  getSize(): number {
    let size = 0
    size += 32
    size += sizeVarint(this.serializedTransactions.length)
    for (const serializedTransaction of this.serializedTransactions) {
      size += sizeVarBytes(serializedTransaction)
    }
    return size
  }
}
