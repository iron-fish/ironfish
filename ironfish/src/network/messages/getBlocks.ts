/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { SerializedBlock } from '../../primitives/block'
import { Direction } from '../messageRouters'
import { NetworkMessageType } from './networkMessage'
import { RpcNetworkMessage } from './rpcNetworkMessage'

export class GetBlocksRequest extends RpcNetworkMessage {
  readonly start: string | number
  readonly limit: number

  constructor(start: string | number, limit: number, rpcId: number) {
    super(NetworkMessageType.GetBlocksRequest, Direction.Request, rpcId)
    this.start = start
    this.limit = limit
  }

  serialize(): Buffer {
    const bw = bufio.write()
    if (typeof this.start === 'string') {
      bw.writeU8(1)
      bw.writeVarString(this.start)
    } else {
      bw.writeU8(0)
      bw.writeU64(this.start)
    }
    bw.writeU64(this.limit)
    return bw.render()
  }

  static deserialize(buffer: Buffer, rpcId: number): GetBlocksRequest {
    const reader = bufio.read(buffer, true)
    const flag = reader.readU8()
    let start
    if (flag) {
      start = reader.readVarString()
    } else {
      start = reader.readU64()
    }
    const limit = reader.readU64()
    return new GetBlocksRequest(start, limit, rpcId)
  }
}

export class GetBlocksResponse extends RpcNetworkMessage {
  readonly blocks: SerializedBlock[]

  constructor(blocks: SerializedBlock[], rpcId: number) {
    super(NetworkMessageType.GetBlocksResponse, Direction.Response, rpcId)
    this.blocks = blocks
  }

  serialize(): Buffer {
    const bw = bufio.write()
    bw.writeU64(this.blocks.length)
    for (const block of this.blocks) {
      bw.writeU64(block.header.sequence)
      bw.writeVarString(block.header.previousBlockHash)
      bw.writeVarBytes(block.header.noteCommitment.commitment)
      bw.writeU64(block.header.noteCommitment.size)
      bw.writeVarString(block.header.nullifierCommitment.commitment)
      bw.writeU64(block.header.nullifierCommitment.size)
      bw.writeVarString(block.header.target)
      bw.writeU64(block.header.randomness)
      bw.writeU64(block.header.timestamp)
      bw.writeVarString(block.header.minersFee)
      bw.writeVarString(block.header.work)
      bw.writeVarString(block.header.graffiti)
      if (block.header.hash) {
        bw.writeU8(1)
        bw.writeVarString(block.header.hash)
      } else {
        bw.writeU8(0)
      }

      bw.writeU64(block.transactions.length)
      for (const transaction of block.transactions) {
        bw.writeVarBytes(transaction)
      }
    }
    return bw.render()
  }

  static deserialize(buffer: Buffer, rpcId: number): GetBlocksResponse {
    const reader = bufio.read(buffer, true)
    const blocks = []

    const blocksLength = reader.readU64()
    for (let i = 0; i < blocksLength; i++) {
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
      const work = reader.readVarString()
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
          work,
          graffiti,
          hash,
        },
        transactions,
      })
    }
    return new GetBlocksResponse(blocks, rpcId)
  }
}
