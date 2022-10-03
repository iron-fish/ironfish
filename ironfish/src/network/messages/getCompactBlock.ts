/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { SerializedCompactBlock } from '../../primitives/block'
import { NetworkMessageType } from '../types'
import { getCompactBlockSize, readCompactBlock, writeCompactBlock } from '../utils/block'
import { Direction, RpcNetworkMessage } from './rpcNetworkMessage'

export class GetCompactBlockRequest extends RpcNetworkMessage {
  readonly blockHash: Buffer

  constructor(blockHash: Buffer, rpcId?: number) {
    super(NetworkMessageType.GetCompactBlockRequest, Direction.Request, rpcId)
    this.blockHash = blockHash
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())

    bw.writeHash(this.blockHash)

    return bw.render()
  }

  static deserialize(buffer: Buffer, rpcId: number): GetCompactBlockRequest {
    const reader = bufio.read(buffer, true)

    const blockHash = reader.readHash()

    return new GetCompactBlockRequest(blockHash, rpcId)
  }

  getSize(): number {
    return 32
  }
}

export class GetCompactBlockResponse extends RpcNetworkMessage {
  readonly compactBlock: SerializedCompactBlock

  constructor(compactBlock: SerializedCompactBlock, rpcId: number) {
    super(NetworkMessageType.GetCompactBlockResponse, Direction.Response, rpcId)
    this.compactBlock = compactBlock
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())

    writeCompactBlock(bw, this.compactBlock)

    return bw.render()
  }

  static deserialize(buffer: Buffer, rpcId: number): GetCompactBlockResponse {
    const reader = bufio.read(buffer, true)

    const compactBlock = readCompactBlock(reader)

    return new GetCompactBlockResponse(compactBlock, rpcId)
  }

  getSize(): number {
    return getCompactBlockSize(this.compactBlock)
  }
}
