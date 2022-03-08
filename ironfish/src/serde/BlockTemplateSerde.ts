/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Block } from '../primitives/block'
import { BlockHeader } from '../primitives/blockheader'
import { NoteEncryptedHashSerde } from '../primitives/noteEncrypted'
import { Target } from '../primitives/target'
import { Strategy } from '../strategy'
import { BigIntUtils } from '../utils'
import { NullifierSerdeInstance } from './serdeInstances'

export type SerializedBlockTemplate = {
  header: {
    sequence: number
    previousBlockHash: string
    noteCommitment: {
      commitment: string
      size: number
    }
    nullifierCommitment: {
      commitment: string
      size: number
    }
    target: string
    randomness: number
    timestamp: number
    minersFee: string
    graffiti: string
  }
  transactions: string[]
  previousBlockInfo?: {
    target: string
    timestamp: number
  }
}

export class BlockTemplateSerde {
  static serialize(block: Block, previousBlock: Block): SerializedBlockTemplate {
    const header = {
      sequence: block.header.sequence,
      previousBlockHash: block.header.previousBlockHash.toString('hex'),
      noteCommitment: {
        commitment: block.header.noteCommitment.commitment.toString('hex'),
        size: block.header.noteCommitment.size,
      },
      nullifierCommitment: {
        commitment: block.header.nullifierCommitment.commitment.toString('hex'),
        size: block.header.nullifierCommitment.size,
      },
      target: BigIntUtils.toBytesBE(block.header.target.asBigInt(), 32).toString('hex'),
      randomness: 0,
      timestamp: block.header.timestamp.getTime(),
      minersFee: BigIntUtils.toBytesBE(block.header.minersFee, 8).toString('hex'),
      graffiti: block.header.graffiti.toString('hex'),
    }
    const previousBlockInfo = {
      target: BigIntUtils.toBytesBE(previousBlock.header.target.asBigInt(), 32).toString('hex'),
      timestamp: previousBlock.header.timestamp.getTime(),
    }

    const transactions = block.transactions.map((t) => t.serialize().toString('hex'))
    return {
      header,
      transactions,
      previousBlockInfo,
    }
  }

  static deserialize(strategy: Strategy, blockTemplate: SerializedBlockTemplate): Block {
    const noteHasher = new NoteEncryptedHashSerde()
    const header = new BlockHeader(
      strategy,
      blockTemplate.header.sequence,
      Buffer.from(blockTemplate.header.previousBlockHash, 'hex'),
      {
        commitment: noteHasher.deserialize(
          Buffer.from(blockTemplate.header.noteCommitment.commitment, 'hex'),
        ),
        size: blockTemplate.header.noteCommitment.size,
      },
      {
        commitment: NullifierSerdeInstance.deserialize(
          blockTemplate.header.nullifierCommitment.commitment,
        ),
        size: blockTemplate.header.nullifierCommitment.size,
      },
      new Target(Buffer.from(blockTemplate.header.target, 'hex')),
      blockTemplate.header.randomness,
      new Date(blockTemplate.header.timestamp),
      BigInt(-1) * BigIntUtils.fromBytes(Buffer.from(blockTemplate.header.minersFee, 'hex')),
      Buffer.from(blockTemplate.header.graffiti, 'hex'),
    )

    const transactions = blockTemplate.transactions.map((t) =>
      strategy.transactionSerde.deserialize(Buffer.from(t, 'hex')),
    )

    return new Block(header, transactions)
  }
}
