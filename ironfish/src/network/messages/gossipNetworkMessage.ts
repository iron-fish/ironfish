/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import tweetnacl from 'tweetnacl'
import { Assert } from '../../assert'
import { NetworkMessageType } from '../types'
import { NetworkMessage } from './networkMessage'

export abstract class GossipNetworkMessage extends NetworkMessage {
  readonly nonce: Buffer

  constructor(type: NetworkMessageType, nonce?: Buffer) {
    super(type)

    this.nonce = nonce ?? Buffer.from(tweetnacl.randomBytes(16))

    Assert.isEqual(this.nonce.byteLength, 16)
  }

  static deserializeHeader(buffer: Buffer): { nonce: Buffer; remaining: Buffer } {
    const br = bufio.read(buffer, true)
    const nonce = br.readBytes(16)
    const remaining = br.readBytes(br.left())
    return { nonce, remaining }
  }

  serializeWithMetadata(): Buffer {
    const headerSize = 17
    const bw = bufio.write(headerSize + this.getSize())
    bw.writeU8(this.type)
    bw.writeBytes(this.nonce)
    bw.writeBytes(this.serialize())
    return bw.render()
  }
}
