/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { NetworkMessageType } from '../types'
import { NetworkMessage } from './networkMessage'

export interface BlockHashInfo {
  hash: Buffer
  sequence: number
}

export class NewBlockHashesMessage extends NetworkMessage {
  readonly blockHashInfos: BlockHashInfo[]

  constructor(blockHashInfos: BlockHashInfo[]) {
    super(NetworkMessageType.NewBlockHashes)
    this.blockHashInfos = blockHashInfos
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeU16(this.blockHashInfos.length)

    for (const blockhashInfo of this.blockHashInfos) {
      bw.writeBytes(blockhashInfo.hash)
      bw.writeU32(blockhashInfo.sequence)
    }
  }

  static deserializePayload(buffer: Buffer): NewBlockHashesMessage {
    const reader = bufio.read(buffer, true)
    const blockHashInfosLength = reader.readU16()
    const blockHashInfos = []

    for (let i = 0; i < blockHashInfosLength; i++) {
      const hash = reader.readBytes(32)
      const sequence = reader.readU32()

      blockHashInfos.push({
        hash,
        sequence,
      })
    }

    return new NewBlockHashesMessage(blockHashInfos)
  }

  getSize(): number {
    let size = 2

    const blockInfoSize = 32 + 4

    size += this.blockHashInfos.length * blockInfoSize

    return size
  }
}
