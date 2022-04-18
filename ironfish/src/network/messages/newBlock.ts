/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { SerializedBlock } from '../../primitives/block'
import { GossipNetworkMessage } from './gossipNetworkMessage'
import { NetworkMessageType } from './networkMessage'

export class NewBlockMessage extends GossipNetworkMessage {
  readonly block: SerializedBlock

  constructor(block: SerializedBlock, nonce: string) {
    super(NetworkMessageType.NewBlock, nonce)
    this.block = block
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    const { header, transactions } = this.block
    bw.writeU64(header.sequence)
    bw.writeVarString(header.previousBlockHash)
    bw.writeVarBytes(header.noteCommitment.commitment)
    bw.writeU64(header.noteCommitment.size)
    bw.writeVarString(header.nullifierCommitment.commitment)
    bw.writeU64(header.nullifierCommitment.size)
    bw.writeVarString(header.target)
    bw.writeU64(header.randomness)
    bw.writeU64(header.timestamp)
    bw.writeVarString(header.minersFee)
    bw.writeVarString(header.graffiti)
    if (header.hash) {
      bw.writeU8(1)
      bw.writeVarString(header.hash)
    } else {
      bw.writeU8(0)
    }

    bw.writeU64(transactions.length)
    for (const transaction of transactions) {
      bw.writeVarBytes(transaction)
    }
    return bw.render()
  }

  static deserialize(buffer: Buffer, nonce: string): NewBlockMessage {
    const reader = bufio.read(buffer, true)
    const sequence = reader.readU64()
    const previousBlockHash = reader.readVarString()
    const noteCommitment = reader.readVarBytes()
    const noteCommitmentSize = reader.readU64()
    const nullifierCommitment = reader.readVarString()
    const nullifierCommitmentSize = reader.readU64()
    const target = reader.readVarString()
    const randomness = reader.readU64()
    const timestamp = reader.readU64()
    const minersFee = reader.readVarString()
    const graffiti = reader.readVarString()
    const flag = reader.readU8()
    let hash
    if (flag) {
      hash = reader.readVarString()
    }

    const transactionsLength = reader.readU64()
    const transactions = []
    for (let j = 0; j < transactionsLength; j++) {
      transactions.push(reader.readVarBytes())
    }
    return new NewBlockMessage(
      {
        header: {
          sequence,
          previousBlockHash,
          noteCommitment: {
            commitment: noteCommitment,
            size: noteCommitmentSize,
          },
          nullifierCommitment: {
            commitment: nullifierCommitment,
            size: nullifierCommitmentSize,
          },
          target,
          randomness,
          timestamp,
          minersFee,
          graffiti,
          hash,
        },
        transactions,
      },
      nonce,
    )
  }

  getSize(): number {
    const { header, transactions } = this.block
    let size = 8
    size += bufio.sizeVarString(header.previousBlockHash)
    size += bufio.sizeVarBytes(header.noteCommitment.commitment)
    size += 8
    size += bufio.sizeVarString(header.nullifierCommitment.commitment)
    size += 8
    size += bufio.sizeVarString(header.target)
    size += 8
    size += 8
    size += bufio.sizeVarString(header.minersFee)
    size += bufio.sizeVarString(header.graffiti)
    size += 1
    if (header.hash) {
      size += bufio.sizeVarString(header.hash)
    }

    size += 8
    for (const transaction of transactions) {
      size += bufio.sizeVarBytes(transaction)
    }
    return size
  }
}
