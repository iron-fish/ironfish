/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { Serializable } from '../../common/serializable'
import { NetworkMessageType } from '../types'

export abstract class NetworkMessage implements Serializable {
  readonly type: NetworkMessageType

  constructor(type: NetworkMessageType) {
    this.type = type
  }

  abstract serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void
  abstract getSize(): number

  static deserializeType(buffer: Buffer): { type: NetworkMessageType; remaining: Buffer } {
    const br = bufio.read(buffer, true)
    const type = br.readU8()
    return { type, remaining: br.readBytes(br.left()) }
  }

  serialize(): Buffer {
    const headerSize = 1
    const bw = bufio.write(headerSize + this.getSize())
    bw.writeU8(this.type)
    this.serializePayload(bw)
    return bw.render()
  }

  displayType(): string {
    return `${NetworkMessageType[this.type]} (${this.type})`
  }
}
