/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { RawBlockHeader } from '../../primitives/blockheader'
import { NetworkMessageType } from '../types'
import { getBlockHeaderSize, readBlockHeader, writeBlockHeader } from '../utils/serializers'
import { Direction, RpcNetworkMessage } from './rpcNetworkMessage'

export class GetBlockHeadersRequest extends RpcNetworkMessage {
  readonly start: number | Buffer
  readonly limit: number
  readonly skip: number
  readonly reverse: boolean

  constructor(
    start: number | Buffer,
    limit: number,
    skip: number,
    reverse: boolean,
    rpcId?: number,
  ) {
    super(NetworkMessageType.GetBlockHeadersRequest, Direction.Request, rpcId)
    this.start = start
    this.limit = limit
    this.skip = skip
    this.reverse = reverse
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    if (Buffer.isBuffer(this.start)) {
      bw.writeU8(1)
      bw.writeHash(this.start)
    } else {
      bw.writeU8(0)
      bw.writeU32(this.start)
    }

    bw.writeU16(this.limit)
    bw.writeU16(this.skip)
    bw.writeU8(Number(this.reverse))
  }

  static deserializePayload(buffer: Buffer, rpcId: number): GetBlockHeadersRequest {
    const reader = bufio.read(buffer, true)

    const isBuffer = Boolean(reader.readU8())
    const start = isBuffer ? reader.readHash() : reader.readU32()

    const limit = reader.readU16()
    const skip = reader.readU16()
    const reverse = Boolean(reader.readU8())
    return new GetBlockHeadersRequest(start, limit, skip, reverse, rpcId)
  }

  getSize(): number {
    let size = 0
    size += 1 // is buffer flag

    if (Buffer.isBuffer(this.start)) {
      size += 32 // start as hash
    } else {
      size += 4 // start as number
    }

    size += 2 // limit
    size += 2 // skip
    size += 1 // reverse
    return size
  }
}

export class GetBlockHeadersResponse extends RpcNetworkMessage {
  readonly headers: RawBlockHeader[]

  constructor(headers: RawBlockHeader[], rpcId: number) {
    super(NetworkMessageType.GetBlockHeadersResponse, Direction.Response, rpcId)
    this.headers = headers
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeU16(this.headers.length)

    for (const header of this.headers) {
      writeBlockHeader(bw, header)
    }
  }

  static deserializePayload(buffer: Buffer, rpcId: number): GetBlockHeadersResponse {
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
