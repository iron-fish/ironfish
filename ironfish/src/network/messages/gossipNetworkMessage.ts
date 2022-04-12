/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { NetworkMessage, NetworkMessageType } from './networkMessage'

export abstract class GossipNetworkMessage extends NetworkMessage {
  readonly nonce: string

  constructor(type: NetworkMessageType, nonce: string) {
    super(type)
    this.nonce = nonce
  }

  serializeWithMetadata(): Buffer {
    const headerSize = 1 + bufio.sizeVarString(this.nonce)
    const bw = bufio.write(headerSize + this.getSize())
    bw.writeU8(this.type)
    bw.writeVarString(this.nonce)
    bw.writeBytes(this.serialize())
    return bw.render()
  }
}
