/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { CompactBlock } from '../../primitives/block'
import { NetworkMessageType } from '../types'
import { getCompactBlockSize, readCompactBlock, writeCompactBlock } from '../utils/serializers'
import { Direction, RpcNetworkMessage } from './rpcNetworkMessage'

export class GetCompactBlockRequest extends RpcNetworkMessage {
  readonly blockHash: Buffer

  constructor(blockHash: Buffer, rpcId?: number) {
    super(NetworkMessageType.GetCompactBlockRequest, Direction.Request, rpcId)
    this.blockHash = blockHash
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeHash(this.blockHash)
  }

  static deserializePayload(buffer: Buffer, rpcId: number): GetCompactBlockRequest {
    const reader = bufio.read(buffer, true)

    const blockHash = reader.readHash()

    return new GetCompactBlockRequest(blockHash, rpcId)
  }

  getSize(): number {
    return 32
  }
}

export class GetCompactBlockResponse extends RpcNetworkMessage {
  readonly compactBlock: CompactBlock

  constructor(compactBlock: CompactBlock, rpcId: number) {
    super(NetworkMessageType.GetCompactBlockResponse, Direction.Response, rpcId)
    this.compactBlock = compactBlock
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    writeCompactBlock(bw, this.compactBlock)
  }

  static deserializePayload(buffer: Buffer, rpcId: number): GetCompactBlockResponse {
    const reader = bufio.read(buffer, true)

    const compactBlock = readCompactBlock(reader)

    return new GetCompactBlockResponse(compactBlock, rpcId)
  }

  getSize(): number {
    return getCompactBlockSize(this.compactBlock)
  }
}
