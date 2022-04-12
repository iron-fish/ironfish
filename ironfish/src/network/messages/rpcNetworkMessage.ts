/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { NetworkMessage, NetworkMessageType } from './networkMessage'

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
    this.rpcId = rpcId ?? RpcNetworkMessage.id++
  }

  serializeWithMetadata(): Buffer {
    const headerSize = 9
    const bw = bufio.write(headerSize + this.getSize())
    bw.writeU8(this.type)
    bw.writeU64(this.rpcId)
    bw.writeBytes(this.serialize())
    return bw.render()
  }
}
