/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { GENESIS_BLOCK_SEQUENCE } from '../../../consensus'
import { BlockHashSerdeInstance } from '../../../serde'
import { ValidationError } from '../../adapters'
import { ApiNamespace, router } from '../router'

export type GetBlockRequest = { index?: number; hash?: string }

interface Operation {
  operation_identifier: { index: number; network_index: number }
  type: string
}
interface Note {
  commitment: string
}
interface Spend {
  nullifier: string
}
interface Transaction {
  transaction_identifier: { hash: string }
  operations: Array<Operation>
  metadata: {
    size: number
    notes: Array<Note>
    spends: Array<Spend>
  }
}
interface Block {
  blockIdentifier: { index: string; hash: string }
  parentBlockIdentifier: { index: string; hash: string }
  timestamp: number
  transactions: Array<Transaction>
  metadata: {
    size: number
    difficulty: number
  }
}
export type GetBlockResponse = Block

export const GetBlockRequestSchema: yup.ObjectSchema<GetBlockRequest> = yup
  .object({
    index: yup.number().strip(true),
    hash: yup.string().strip(true),
  })
  .defined()

const NoteSchema = yup
  .object()
  .shape({
    commitment: yup.string().defined(),
  })
  .defined()

const SpendSchema = yup
  .object()
  .shape({
    nullifier: yup.string().defined(),
  })
  .defined()

const OperationSchema = yup
  .object()
  .shape({
    type: yup.string().defined(),
    operation_identifier: yup
      .object()
      .shape({
        index: yup.number().defined(),
        network_index: yup.number().defined(),
      })
      .defined(),
  })
  .defined()

const TransactionSchema = yup
  .object()
  .shape({
    transaction_identifier: yup.object({ hash: yup.string().defined() }).defined(),
    operations: yup.array().of(OperationSchema).defined(),
    metadata: yup
      .object({
        notes: yup.array().of(NoteSchema).defined(),
        spends: yup.array().of(SpendSchema).defined(),
        size: yup.number().defined(),
      })
      .defined(),
  })
  .defined()

export const GetBlockResponseSchema: yup.ObjectSchema<GetBlockResponse> = yup
  .object({
    blockIdentifier: yup
      .object({ index: yup.string().defined(), hash: yup.string().defined() })
      .defined(),
    parentBlockIdentifier: yup
      .object({ index: yup.string().defined(), hash: yup.string().defined() })
      .defined(),
    timestamp: yup.number().defined(),
    transactions: yup.array().of(TransactionSchema).defined(),
    metadata: yup
      .object({
        size: yup.number().defined(),
        difficulty: yup.number().defined(),
      })
      .defined(),
  })
  .defined()

router.register<typeof GetBlockRequestSchema, GetBlockResponse>(
  `${ApiNamespace.chain}/getBlock`,
  GetBlockRequestSchema,
  async (request, node): Promise<void> => {
    let hashBuffer = null
    let sequence = null

    if (request.data.hash) {
      hashBuffer = BlockHashSerdeInstance.deserialize(request.data.hash)
    }

    if (request.data.index) {
      sequence = request.data.index
    }

    if (!hashBuffer && !sequence) {
      throw new ValidationError(`Missing hash or sequence`)
    }

    // Get a block hash for the specific sequence
    // You must assume that the block returned will not be idempotent
    // Given that a chain reorg event might cause the specific block
    // at that sequence can be set to a different one
    if (!hashBuffer && sequence) {
      const hashBuffers = await node.chain.getHashesAtSequence(sequence)
      if (Array.isArray(hashBuffers) && hashBuffers.length > 0) {
        hashBuffer = hashBuffers[0]
      }
    }

    if (!hashBuffer) {
      throw new ValidationError(`No block found at provided sequence`)
    }

    const block = await node.chain.getBlock(hashBuffer)
    if (!block) {
      throw new ValidationError(`No block found`)
    }

    let parentBlock
    if (block.header.sequence === GENESIS_BLOCK_SEQUENCE) {
      parentBlock = block
    } else {
      parentBlock = await node.chain.getBlock(block.header.previousBlockHash)
    }

    if (!parentBlock) {
      throw new ValidationError(`No parent block found`)
    }

    const transactions = block.transactions.map((transaction) => {
      const notes = [...transaction.notes()].map((note) => ({
        commitment: Buffer.from(note.merkleHash()).toString('hex'),
      }))

      const spends = [...transaction.spends()].map((spend) => ({
        nullifier: BlockHashSerdeInstance.serialize(spend.nullifier),
      }))

      // TODO(IRO-289) We need a better way to either serialize directly to buffer or use CBOR
      const transactionBuffer = Buffer.from(
        JSON.stringify(node.strategy.transactionSerde.serialize(transaction)),
      )

      return {
        transaction_identifier: {
          hash: BlockHashSerdeInstance.serialize(transaction.hash()),
        },
        operations: [],
        metadata: {
          notes,
          spends,
          size: transactionBuffer.byteLength,
          fee: Number(transaction.fee()),
        },
      }
    })

    // TODO(IRO-289) We need a better way to either serialize directly to buffer or use CBOR
    const blockBuffer = Buffer.from(JSON.stringify(node.strategy.blockSerde.serialize(block)))

    request.end({
      blockIdentifier: {
        index: block.header.sequence.toString(),
        hash: BlockHashSerdeInstance.serialize(block.header.hash),
      },
      parentBlockIdentifier: {
        index: parentBlock.header.sequence.toString(),
        hash: BlockHashSerdeInstance.serialize(parentBlock.header.hash),
      },
      timestamp: block.header.timestamp.getTime(),
      transactions,
      metadata: {
        size: blockBuffer.byteLength,
        difficulty: Number(block.header.target.toDifficulty()),
      },
    })
  },
)
