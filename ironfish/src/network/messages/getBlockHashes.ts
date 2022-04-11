/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { Direction } from '../messageRouters'
import { NetworkMessageType } from './networkMessage'
import { RpcNetworkMessage } from './rpcNetworkMessage'

export class GetBlockHashesRequest extends RpcNetworkMessage {
  readonly start: string | number
  readonly limit: number

  constructor(start: string | number, limit: number, rpcId: number) {
    super(NetworkMessageType.GetBlockHashesRequest, Direction.Request, rpcId)
    this.start = start
    this.limit = limit
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    if (typeof this.start === 'string') {
      bw.writeU8(1)
      bw.writeVarString(this.start)
    } else {
      bw.writeU8(0)
      bw.writeU64(this.start)
    }
    bw.writeU64(this.limit)
    return bw.render()
  }

  static deserialize(buffer: Buffer, rpcId: number): GetBlockHashesRequest {
    const reader = bufio.read(buffer, true)
    const flag = reader.readU8()
    let start
    if (flag) {
      start = reader.readVarString()
    } else {
      start = reader.readU64()
    }
    const limit = reader.readU64()
    return new GetBlockHashesRequest(start, limit, rpcId)
  }

  getSize(): number {
    let size = 0
    if (typeof this.start === 'string') {
      size += 1 + bufio.sizeVarString(this.start)
    } else {
      size += 1 + 8
    }
    return size + 8
  }
}

export class GetBlockHashesResponse extends RpcNetworkMessage {
  readonly blocks: string[]

  constructor(blocks: string[], rpcId: number) {
    super(NetworkMessageType.GetBlockHashesResponse, Direction.Response, rpcId)
    this.blocks = blocks
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeU64(this.blocks.length)
    for (const block of this.blocks) {
      bw.writeVarString(block)
    }
    return bw.render()
  }

  static deserialize(buffer: Buffer, rpcId: number): GetBlockHashesResponse {
    const reader = bufio.read(buffer, true)
    const length = reader.readU64()
    const blocks = []
    for (let i = 0; i < length; i++) {
      blocks.push(reader.readVarString())
    }
    return new GetBlockHashesResponse(blocks, rpcId)
  }

  getSize(): number {
    let size = 8
    for (const block of this.blocks) {
      size += bufio.sizeVarString(block)
    }
    return size
  }
}
