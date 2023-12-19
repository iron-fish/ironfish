/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { RawBlock } from '../../primitives/block'
import { NetworkMessageType } from '../types'
import { getBlockSize, readBlock, writeBlock } from '../utils/serializers'
import { Direction, RpcNetworkMessage } from './rpcNetworkMessage'

export class GetBlocksRequest extends RpcNetworkMessage {
  readonly start: Buffer
  readonly limit: number

  constructor(start: Buffer, limit: number, rpcId?: number) {
    super(NetworkMessageType.GetBlocksRequest, Direction.Request, rpcId)
    this.start = start
    this.limit = limit
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeHash(this.start)
    bw.writeU16(this.limit)
  }

  static deserializePayload(buffer: Buffer, rpcId: number): GetBlocksRequest {
    const reader = bufio.read(buffer, true)
    const start = reader.readHash()
    const limit = reader.readU16()
    return new GetBlocksRequest(start, limit, rpcId)
  }

  getSize(): number {
    let size = 0
    size += 32
    size += 2
    return size
  }
}

export class GetBlocksResponse extends RpcNetworkMessage {
  readonly blocks: RawBlock[]

  constructor(blocks: RawBlock[], rpcId: number) {
    super(NetworkMessageType.GetBlocksResponse, Direction.Response, rpcId)
    this.blocks = blocks
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeU16(this.blocks.length)

    for (const block of this.blocks) {
      writeBlock(bw, block)
    }
  }

  static deserializePayload(buffer: Buffer, rpcId: number): GetBlocksResponse {
    const reader = bufio.read(buffer, true)
    const blocks = []

    const blocksLength = reader.readU16()
    for (let i = 0; i < blocksLength; i++) {
      const block = readBlock(reader)
      blocks.push(block)
    }

    return new GetBlocksResponse(blocks, rpcId)
  }

  getSize(): number {
    let size = 0
    size += 2 // blocks length

    for (const block of this.blocks) {
      size += getBlockSize(block)
    }

    return size
  }
}
