/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { CompactBlock } from '../../primitives/block'
import { NetworkMessageType } from '../types'
import { getCompactBlockSize, readCompactBlock, writeCompactBlock } from '../utils/serializers'
import { NetworkMessage } from './networkMessage'

export class NewCompactBlockMessage extends NetworkMessage {
  readonly compactBlock: CompactBlock

  constructor(compactBlock: CompactBlock) {
    super(NetworkMessageType.NewCompactBlock)
    this.compactBlock = compactBlock
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())

    writeCompactBlock(bw, this.compactBlock)

    return bw.render()
  }

  static deserialize(buffer: Buffer): NewCompactBlockMessage {
    const reader = bufio.read(buffer, true)

    const compactBlock = readCompactBlock(reader)

    return new NewCompactBlockMessage(compactBlock)
  }

  getSize(): number {
    return getCompactBlockSize(this.compactBlock)
  }
}
