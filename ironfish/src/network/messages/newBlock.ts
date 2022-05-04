/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { SerializedBlock } from '../../primitives/block'
import { NetworkMessageType } from '../types'
import { getBlockSize, readBlock, writeBlock } from '../utils/block'
import { GossipNetworkMessage } from './gossipNetworkMessage'

export class NewBlockMessage extends GossipNetworkMessage {
  readonly block: SerializedBlock

  constructor(block: SerializedBlock, nonce?: Buffer) {
    super(NetworkMessageType.NewBlock, nonce)
    this.block = block
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())

    writeBlock(bw, this.block)

    return bw.render()
  }

  static deserialize(buffer: Buffer, nonce: Buffer): NewBlockMessage {
    const reader = bufio.read(buffer, true)
    const block = readBlock(reader)

    return new NewBlockMessage(block, nonce)
  }

  getSize(): number {
    return getBlockSize(this.block)
  }
}
