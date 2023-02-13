/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { BlockHeader } from '../../primitives'
import { NetworkMessageType } from '../types'
import { getBlockHeaderSize, readBlockHeader, writeBlockHeader } from '../utils/serializers'
import { Direction, RpcNetworkMessage } from './rpcNetworkMessage'

export class GetBlockHeadersRequest extends RpcNetworkMessage {
  readonly start: number
  readonly limit: number
  readonly skip: number
  readonly reverse: boolean

  constructor(start: number, limit: number, skip: number, reverse: boolean, rpcId?: number) {
    super(NetworkMessageType.GetBlockHeadersRequest, Direction.Request, rpcId)
    this.start = start
    this.limit = limit
    this.skip = skip
    this.reverse = reverse
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeU32(this.start)
    bw.writeU16(this.limit)
    bw.writeU16(this.skip)
    bw.writeU8(Number(this.reverse))
    return bw.render()
  }

  static deserialize(buffer: Buffer, rpcId: number): GetBlockHeadersRequest {
    const reader = bufio.read(buffer, true)
    const start = reader.readU32()
    const limit = reader.readU16()
    const skip = reader.readU16()
    const reverse = Boolean(reader.readU8())
    return new GetBlockHeadersRequest(start, limit, skip, reverse, rpcId)
  }

  getSize(): number {
    let size = 0
    size += 4 // start
    size += 2 // limit
    size += 2 // skip
    size += 1 // reverse
    return size
  }
}

export class GetBlockHeadersResponse extends RpcNetworkMessage {
  readonly headers: BlockHeader[]

  constructor(headers: BlockHeader[], rpcId: number) {
    super(NetworkMessageType.GetBlockHeadersResponse, Direction.Response, rpcId)
    this.headers = headers
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())

    bw.writeU16(this.headers.length)

    for (const header of this.headers) {
      writeBlockHeader(bw, header)
    }

    return bw.render()
  }

  static deserialize(buffer: Buffer, rpcId: number): GetBlockHeadersResponse {
    const reader = bufio.read(buffer, true)
    const headers = []

    const headersLength = reader.readU16()
    for (let i = 0; i < headersLength; i++) {
      const header = readBlockHeader(reader)
      headers.push(header)
    }

    return new GetBlockHeadersResponse(headers, rpcId)
  }

  getSize(): number {
    let size = 0
    size += 2 // headers length
    size += getBlockHeaderSize() * this.headers.length

    return size
  }
}
