/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { Serializable } from '../../common/serializable'

export enum NetworkMessageType {
  Disconnecting = 0,
  CannotSatisfyRequest = 1,
  GetBlockHashesRequest = 2,
  GetBlockHashesResponse = 3,
  GetBlocksRequest = 4,
  GetBlocksResponse = 5,
  Identify = 6,
  PeerList = 7,
  PeerListRequest = 8,
  Signal = 9,
  SignalRequest = 10,
}

export abstract class NetworkMessage implements Serializable {
  readonly type: NetworkMessageType

  constructor(type: NetworkMessageType) {
    this.type = type
  }

  abstract serialize(): Buffer
  abstract getSize(): number

  serializeWithMetadata(): Buffer {
    const headerSize = 9
    const bw = bufio.write(headerSize + this.getSize())
    bw.writeU8(this.type)
    bw.writeU64(this.getSize())
    bw.writeBytes(this.serialize())
    return bw.render()
  }
}
