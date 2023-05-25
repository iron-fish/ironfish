/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NetworkMessageType } from '../types'
import bufio from 'bufio'
import { NetworkMessage } from './networkMessage'

export type RpcId = number
export const RPC_TIMEOUT_MILLIS = 30000

export enum Direction {
  Request = 'request',
  Response = 'response',
}

export abstract class RpcNetworkMessage extends NetworkMessage {
  private static id = 0

  readonly direction: Direction
  readonly rpcId: number

  constructor(type: NetworkMessageType, direction: Direction, rpcId?: number) {
    super(type)
    this.direction = direction
    this.rpcId = rpcId ?? (RpcNetworkMessage.id = ++RpcNetworkMessage.id % 0xffff)
  }

  static deserializeHeader(buffer: Buffer): { rpcId: number; remaining: Buffer } {
    const br = bufio.read(buffer, true)
    const rpcId = br.readU16()
    const remaining = br.readBytes(br.left())
    return { rpcId, remaining }
  }

  serialize(): Buffer {
    const headerSize = 3
    const bw = bufio.write(headerSize + this.getSize())
    bw.writeU8(this.type)
    bw.writeU16(this.rpcId)
    this.serializePayload(bw)
    return bw.render()
  }
}
