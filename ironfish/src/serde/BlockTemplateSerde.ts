/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Blockchain } from '../blockchain'
import { Block, RawBlock } from '../primitives/block'
import { NoteEncryptedHashSerde } from '../primitives/noteEncrypted'
import { Target } from '../primitives/target'
import { Transaction } from '../primitives/transaction'
import { BigIntUtils } from '../utils'

export type SerializedBlockTemplate = {
  header: {
    sequence: number
    previousBlockHash: string
    noteCommitment: string
    transactionCommitment: string
    target: string
    randomness: string
    timestamp: number
    graffiti: string
  }
  transactions: string[]
  previousBlockInfo?: {
    target: string
    timestamp: number
  }
}

export class RawBlockTemplateSerde {
  static serialize(block: RawBlock, previousBlock: RawBlock): SerializedBlockTemplate {
    const header = {
      sequence: block.header.sequence,
      previousBlockHash: block.header.previousBlockHash.toString('hex'),
      noteCommitment: block.header.noteCommitment.toString('hex'),
      transactionCommitment: block.header.transactionCommitment.toString('hex'),
      target: BigIntUtils.writeBigU256BE(block.header.target.asBigInt()).toString('hex'),
      randomness: BigIntUtils.writeBigU64BE(block.header.randomness).toString('hex'),
      timestamp: block.header.timestamp.getTime(),
      graffiti: block.header.graffiti.toString('hex'),
    }
    const previousBlockInfo = {
      target: BigIntUtils.writeBigU256BE(previousBlock.header.target.asBigInt()).toString(
        'hex',
      ),
      timestamp: previousBlock.header.timestamp.getTime(),
    }

    const transactions = block.transactions.map((t) => t.serialize().toString('hex'))
    return {
      header,
      transactions,
      previousBlockInfo,
    }
  }

  static deserialize(blockTemplate: SerializedBlockTemplate): RawBlock {
    const noteHasher = new NoteEncryptedHashSerde()

    return {
      header: {
        sequence: blockTemplate.header.sequence,
        previousBlockHash: Buffer.from(blockTemplate.header.previousBlockHash, 'hex'),
        noteCommitment: noteHasher.deserialize(
          Buffer.from(blockTemplate.header.noteCommitment, 'hex'),
        ),
        transactionCommitment: Buffer.from(blockTemplate.header.transactionCommitment, 'hex'),
        target: new Target(Buffer.from(blockTemplate.header.target, 'hex')),
        randomness: BigIntUtils.fromBytesBE(
          Buffer.from(blockTemplate.header.randomness, 'hex'),
        ),
        timestamp: new Date(blockTemplate.header.timestamp),
        graffiti: Buffer.from(blockTemplate.header.graffiti, 'hex'),
      },
      transactions: blockTemplate.transactions.map(
        (t) => new Transaction(Buffer.from(t, 'hex')),
      ),
    }
  }
}

export class BlockTemplateSerde {
  static serialize(block: Block, previousBlock: Block): SerializedBlockTemplate {
    return RawBlockTemplateSerde.serialize(block, previousBlock)
  }

  static deserialize(blockTemplate: SerializedBlockTemplate, chain: Blockchain): Block {
    const rawBlock = RawBlockTemplateSerde.deserialize(blockTemplate)

    return chain.newBlockFromRaw(rawBlock)
  }
}
