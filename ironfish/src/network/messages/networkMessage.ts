/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { Serializable } from '../../common/serializable'

export enum NetworkMessageType {
  Identify = 0,
}

export abstract class NetworkMessage implements Serializable {
  private static id = 0

  readonly messageId: number
  readonly type: NetworkMessageType

  constructor(type: NetworkMessageType, messageId?: number) {
    this.messageId = messageId ?? NetworkMessage.id++
    this.type = type
  }

  abstract serialize(): Buffer
  abstract getSize(): number

  serializeWithMetadata(): Buffer {
    const headerSize = 17
    const bw = bufio.write(headerSize + this.getSize())
    bw.writeU64(this.messageId)
    bw.writeU8(this.type)
    bw.writeU64(this.getSize())
    bw.writeBytes(this.serialize())
    return bw.render()
  }
}
