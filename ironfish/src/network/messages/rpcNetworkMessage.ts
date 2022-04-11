/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { Direction } from '../messageRouters'
import { NetworkMessage, NetworkMessageType } from './networkMessage'

export abstract class RpcNetworkMessage extends NetworkMessage {
  readonly direction: Direction
  readonly rpcId: number

  constructor(type: NetworkMessageType, direction: Direction, rpcId: number) {
    super(type)
    this.direction = direction
    this.rpcId = rpcId
  }

  serializeWithMetadata(): Buffer {
    const bw = bufio.write()
    bw.writeU8(this.type)
    bw.writeU64(this.rpcId)
    bw.writeBytes(this.serialize())
    return bw.render()
  }
}
