/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { Assert } from '../../assert'
import { NetworkMessageType } from '../types'
import { Direction, RpcNetworkMessage } from './rpcNetworkMessage'

export class GetBlockHashesRequest extends RpcNetworkMessage {
  readonly start: number
  readonly limit: number

  constructor(start: number, limit: number, rpcId?: number) {
    super(NetworkMessageType.GetBlockHashesRequest, Direction.Request, rpcId)
    this.start = start
    this.limit = limit
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeU32(this.start)
    bw.writeU16(this.limit)
    return bw.render()
  }

  static deserialize(buffer: Buffer, rpcId: number): GetBlockHashesRequest {
    const reader = bufio.read(buffer, true)
    const start = reader.readU32()
    const limit = reader.readU16()
    return new GetBlockHashesRequest(start, limit, rpcId)
  }

  getSize(): number {
    let size = 0
    size += 4
    size += 2
    return size
  }
}

export class GetBlockHashesResponse extends RpcNetworkMessage {
  readonly hashes: Buffer[]

  constructor(hashes: Buffer[], rpcId: number) {
    super(NetworkMessageType.GetBlockHashesResponse, Direction.Response, rpcId)
    this.hashes = hashes
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeU16(this.hashes.length)
    for (const hash of this.hashes) {
      bw.writeHash(hash)
    }
    return bw.render()
  }

  static deserialize(buffer: Buffer, rpcId: number): GetBlockHashesResponse {
    const reader = bufio.read(buffer, true)

    const length = reader.readU16()

    Assert.isEqual(reader.left() / 32, length)

    const blocks = []
    for (let i = 0; i < length; i++) {
      blocks.push(reader.readHash())
    }

    return new GetBlockHashesResponse(blocks, rpcId)
  }

  getSize(): number {
    let size = 0
    size += 2
    size += this.hashes.length * 32
    return size
  }
}
