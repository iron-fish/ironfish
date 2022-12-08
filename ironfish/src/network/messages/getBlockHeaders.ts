/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { Block } from '../../primitives/block'
import { NetworkMessageType } from '../types'
import { getBlockSize, readBlock, writeBlock } from '../utils/serializers'
import { Direction, RpcNetworkMessage } from './rpcNetworkMessage'

export class GetBlockHeadersRequest extends RpcNetworkMessage {
  readonly start: Buffer
  readonly limit: number

  constructor(start: Buffer, limit: number, rpcId?: number) {
    super(NetworkMessageType.GetBlockHeadersRequest, Direction.Request, rpcId)
    this.start = start
    this.limit = limit
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeHash(this.start)
    bw.writeU16(this.limit)
    return bw.render()
  }

  static deserialize(buffer: Buffer, rpcId: number): GetBlockHeadersRequest {
    const reader = bufio.read(buffer, true)
    const start = reader.readHash()
    const limit = reader.readU16()
    return new GetBlockHeadersRequest(start, limit, rpcId)
  }

  getSize(): number {
    let size = 0
    size += 32
    size += 2
    return size
  }
}

export class GetBlockHeadersResponse extends RpcNetworkMessage {
  readonly blocks: Block[]

  constructor(blocks: Block[], rpcId: number) {
    super(NetworkMessageType.GetBlockHeadersResponse, Direction.Response, rpcId)
    this.blocks = blocks
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())

    bw.writeU16(this.blocks.length)

    for (const block of this.blocks) {
      writeBlock(bw, block)
    }

    return bw.render()
  }

  static deserialize(buffer: Buffer, rpcId: number): GetBlockHeadersResponse {
    const reader = bufio.read(buffer, true)
    const blocks = []

    const blocksLength = reader.readU16()
    for (let i = 0; i < blocksLength; i++) {
      const block = readBlock(reader)
      blocks.push(block)
    }

    return new GetBlockHeadersResponse(blocks, rpcId)
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
