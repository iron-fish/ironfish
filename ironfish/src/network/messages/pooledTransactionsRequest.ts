/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { TransactionHash } from '../../primitives/transaction'
import { NetworkMessageType } from '../types'
import { Direction, RpcNetworkMessage } from './rpcNetworkMessage'

export class PooledTransactionsRequest extends RpcNetworkMessage {
  transactionHashes: TransactionHash[]

  constructor(transactionHashes: TransactionHash[], rpcId?: number) {
    super(NetworkMessageType.PooledTransactionsRequest, Direction.Request, rpcId)
    this.transactionHashes = transactionHashes
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())

    bw.writeVarint(this.transactionHashes.length)

    for (const hash of this.transactionHashes) {
      bw.writeHash(hash)
    }

    return bw.render()
  }

  static deserialize(buffer: Buffer, rpcId: number): PooledTransactionsRequest {
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
