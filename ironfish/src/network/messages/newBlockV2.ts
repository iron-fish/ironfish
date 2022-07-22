/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio, { sizeVarBytes, sizeVarint } from 'bufio'
import { CompactBlockTransaction, SerializedCompactBlock } from '../../primitives/block'
import { NetworkMessageType } from '../types'
import { getBlockHeaderSize, readBlockHeader, writeBlockHeader } from '../utils/block'
import { NetworkMessage } from './networkMessage'

export class NewBlockV2Message extends NetworkMessage {
  readonly compactBlock: SerializedCompactBlock

  constructor(compactBlock: SerializedCompactBlock) {
    super(NetworkMessageType.NewBlockV2)
    this.compactBlock = compactBlock
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())

    writeBlockHeader(bw, this.compactBlock.header)

    bw.writeVarint(this.compactBlock.transactionHashes.length)
    for (const transactionHash of this.compactBlock.transactionHashes) {
      bw.writeHash(transactionHash)
    }

    bw.writeVarint(this.compactBlock.transactions.length)
    for (const transaction of this.compactBlock.transactions) {
      bw.writeVarint(transaction.index)
      bw.writeVarBytes(transaction.transaction)
    }

    return bw.render()
  }

  static deserialize(buffer: Buffer): NewBlockV2Message {
    const reader = bufio.read(buffer, true)

    const header = readBlockHeader(reader)

    const transactionHashes: Buffer[] = []
    const transactionHashesLength = reader.readVarint()
    for (let i = 0; i < transactionHashesLength; i++) {
      const transactionHash = reader.readHash()
      transactionHashes.push(transactionHash)
    }

    const transactions: CompactBlockTransaction[] = []
    const transactionsLength = reader.readVarint()
    for (let i = 0; i < transactionsLength; i++) {
      const index = reader.readVarint()
      const transaction = reader.readVarBytes()
      transactions.push({ index, transaction })
    }

    const compactBlock: SerializedCompactBlock = {
      header,
      transactionHashes,
      transactions,
    }

    return new NewBlockV2Message(compactBlock)
  }

  getSize(): number {
    let size = 0

    size += getBlockHeaderSize()

    size += sizeVarint(this.compactBlock.transactionHashes.length)
    size += 32 * this.compactBlock.transactionHashes.length

    size += sizeVarint(this.compactBlock.transactions.length)
    for (const transaction of this.compactBlock.transactions) {
      size += sizeVarint(transaction.index)
      size += sizeVarBytes(transaction.transaction)
    }

    return size
  }
}
