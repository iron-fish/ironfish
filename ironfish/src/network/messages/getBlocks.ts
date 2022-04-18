/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { SerializedBlock } from '../../primitives/block'
import { GraffitiSerdeInstance } from '../../serde'
import { BigIntUtils } from '../../utils/bigint'
import { NetworkMessageType } from './networkMessage'
import { Direction, RpcNetworkMessage } from './rpcNetworkMessage'

export class GetBlocksRequest extends RpcNetworkMessage {
  readonly start: Buffer
  readonly limit: number

  constructor(start: Buffer, limit: number, rpcId?: number) {
    super(NetworkMessageType.GetBlocksRequest, Direction.Request, rpcId)
    this.start = start
    this.limit = limit
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeHash(this.start)
    bw.writeU16(this.limit)
    return bw.render()
  }

  static deserialize(buffer: Buffer, rpcId: number): GetBlocksRequest {
    const reader = bufio.read(buffer, true)
    const start = reader.readHash()
    const limit = reader.readU16()
    return new GetBlocksRequest(start, limit, rpcId)
  }

  getSize(): number {
    let size = 0
    size += 32
    size += 2
    return size
  }
}

export class GetBlocksResponse extends RpcNetworkMessage {
  readonly blocks: SerializedBlock[]

  constructor(blocks: SerializedBlock[], rpcId: number) {
    super(NetworkMessageType.GetBlocksResponse, Direction.Response, rpcId)
    this.blocks = blocks
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())

    bw.writeU16(this.blocks.length)

    for (const block of this.blocks) {
      bw.writeU32(block.header.sequence)
      bw.writeHash(block.header.previousBlockHash)
      bw.writeHash(block.header.noteCommitment.commitment)
      bw.writeU32(block.header.noteCommitment.size)
      bw.writeHash(block.header.nullifierCommitment.commitment)
      bw.writeU32(block.header.nullifierCommitment.size)
      bw.writeBytes(BigIntUtils.toBytesLE(BigInt(block.header.target), 32))
      bw.writeU64(block.header.randomness)
      bw.writeU64(block.header.timestamp)
      bw.writeBytes(BigIntUtils.toBytesLE(BigInt(block.header.minersFee), 8))
      bw.writeBytes(GraffitiSerdeInstance.deserialize(block.header.graffiti))

      bw.writeU16(block.transactions.length)
      for (const transaction of block.transactions) {
        bw.writeVarBytes(transaction)
      }
    }

    return bw.render()
  }

  static deserialize(buffer: Buffer, rpcId: number): GetBlocksResponse {
    const reader = bufio.read(buffer, true)
    const blocks = []

    const blocksLength = reader.readU16()
    for (let i = 0; i < blocksLength; i++) {
      const sequence = reader.readU32()
      const previousBlockHash = reader.readHash('hex')
      const noteCommitment = reader.readHash()
      const noteCommitmentSize = reader.readU32()
      const nullifierCommitment = reader.readHash('hex')
      const nullifierCommitmentSize = reader.readU32()
      const target = BigIntUtils.fromBytesLE(reader.readBytes(32)).toString()
      const randomness = reader.readU64()
      const timestamp = reader.readU64()
      const minersFee = BigIntUtils.fromBytesLE(reader.readBytes(8)).toString()
      const graffiti = GraffitiSerdeInstance.serialize(reader.readBytes(32))

      const transactionsLength = reader.readU16()
      const transactions = []
      for (let j = 0; j < transactionsLength; j++) {
        transactions.push(reader.readVarBytes())
      }
      blocks.push({
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
        },
        transactions,
      })
    }
    return new GetBlocksResponse(blocks, rpcId)
  }

  getSize(): number {
    let size = 0
    size += 2 // blocks length
    for (const block of this.blocks) {
      size += 4 // sequence
      size += 32 // previousBlockHash
      size += 32 // noteCommitment.commitment
      size += 4 // noteCommitment.size
      size += 32 // nullifierCommitment.commitment
      size += 4 // nullifierCommitment.size
      size += 32 // target
      size += 8 // randomness
      size += 8 // timestamp
      size += 8 // minersFee
      size += 32 // graffiti

      size += 2 // transactions length
      for (const transaction of block.transactions) {
        size += bufio.sizeVarBytes(transaction)
      }
    }
    return size
  }
}
