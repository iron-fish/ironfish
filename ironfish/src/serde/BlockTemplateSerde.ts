/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Block } from '../primitives/block'
import { BlockHeader } from '../primitives/blockheader'
import { NoteEncryptedHashSerde } from '../primitives/noteEncrypted'
import { Target } from '../primitives/target'
import { Transaction } from '../primitives/transaction'
import { RpcBlockHeader } from '../rpc'
import { BigIntUtils } from '../utils'

export type SerializedBlockTemplate = {
  header: RpcBlockHeader
  transactions: string[]
  previousBlockInfo?: {
    target: string
    timestamp: number
  }
}

export class BlockTemplateSerde {
  static serialize(block: Block, previousBlock: Block): SerializedBlockTemplate {
    const header = {
      hash: block.header.hash.toString('hex'),
      difficulty: block.header.target.toDifficulty().toString(),
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

  static deserialize(blockTemplate: SerializedBlockTemplate): Block {
    const noteHasher = new NoteEncryptedHashSerde()
    const header = new BlockHeader(
      blockTemplate.header.sequence,
      Buffer.from(blockTemplate.header.previousBlockHash, 'hex'),
      noteHasher.deserialize(Buffer.from(blockTemplate.header.noteCommitment, 'hex')),
      Buffer.from(blockTemplate.header.transactionCommitment, 'hex'),
      new Target(Buffer.from(blockTemplate.header.target, 'hex')),
      BigIntUtils.fromBytesBE(Buffer.from(blockTemplate.header.randomness, 'hex')),
      new Date(blockTemplate.header.timestamp),
      Buffer.from(blockTemplate.header.graffiti, 'hex'),
    )

    const transactions = blockTemplate.transactions.map(
      (t) => new Transaction(Buffer.from(t, 'hex')),
    )

    return new Block(header, transactions)
  }
}
