/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { isValidIncomingViewKey } from '../../../account/validator'
import { Assert } from '../../../assert'
import { ChainProcessor } from '../../../chainProcessor'
import { Block } from '../../../primitives/block'
import { BlockHeader } from '../../../primitives/blockheader'
import { PromiseUtils } from '../../../utils/promise'
import { ValidationError } from '../../adapters/errors'
import { ApiNamespace, router } from '../router'

interface Note {
  amount: string
  memo: string
}

interface Transaction {
  hash: string
  isMinersFee: boolean
  notes: Note[]
}

const NoteSchema = yup
  .object()
  .shape({
    amount: yup.string().required(),
    memo: yup.string().required(),
  })
  .required()

const TransactionSchema = yup
  .object()
  .shape({
    hash: yup.string().required(),
    isMinersFee: yup.boolean().required(),
    notes: yup.array().of(NoteSchema).required(),
  })
  .required()

export type GetTransactionStreamRequest = { incomingViewKey: string; head?: string | null }

export type GetTransactionStreamResponse = {
  type: 'connected' | 'disconnected' | 'fork'
  head: {
    sequence: number
  }
  block: {
    hash: string
    previousBlockHash: string
    sequence: number
    timestamp: number
  }
  transactions: Transaction[]
}

export const GetTransactionStreamRequestSchema: yup.ObjectSchema<GetTransactionStreamRequest> =
  yup
    .object({
      incomingViewKey: yup.string().required(),
      head: yup.string().nullable().optional(),
    })
    .required()
export const GetTransactionStreamResponseSchema: yup.ObjectSchema<GetTransactionStreamResponse> =
  yup
    .object({
      transactions: yup.array().of(TransactionSchema).required(),
      type: yup.string().oneOf(['connected', 'disconnected', 'fork']).required(),
      block: yup
        .object({
          hash: yup.string().required(),
          sequence: yup.number().required(),
          timestamp: yup.number().required(),
          previousBlockHash: yup.string().required(),
        })
        .defined(),
      head: yup
        .object({
          sequence: yup.number().required(),
        })
        .defined(),
    })
    .defined()

router.register<typeof GetTransactionStreamRequestSchema, GetTransactionStreamResponse>(
  `${ApiNamespace.chain}/getTransactionStream`,
  GetTransactionStreamRequestSchema,
  async (request, node): Promise<void> => {
    if (!isValidIncomingViewKey(request.data.incomingViewKey)) {
      throw new ValidationError(`incomingViewKey is not valid`)
    }

    const head = request.data.head ? Buffer.from(request.data.head, 'hex') : null

    if (head && !(await node.chain.hasBlock(head))) {
      throw new ValidationError(
        `Block with hash ${String(request.data.head)} was not found in the chain`,
      )
    }

    const processor = new ChainProcessor({
      chain: node.chain,
      logger: node.logger,
      head: head,
    })

    const processBlock = (block: Block, type: 'connected' | 'disconnected' | 'fork'): void => {
      const transactions: Transaction[] = []

      for (const tx of block.transactions) {
        const notes = new Array<Note>()

        for (const note of tx.notes()) {
          const decryptedNote = note.decryptNoteForOwner(request.data.incomingViewKey)

          if (decryptedNote) {
            notes.push({
              amount: decryptedNote.value().toString(),
              memo: decryptedNote.memo(),
            })
          }
        }

        if (notes.length) {
          transactions.push({
            hash: tx.unsignedHash().toString('hex'),
            isMinersFee: tx.isMinersFee(),
            notes: notes,
          })
        }
      }

      request.stream({
        type,
        transactions,
        block: {
          hash: block.header.hash.toString('hex'),
          sequence: block.header.sequence,
          timestamp: block.header.timestamp.valueOf(),
          previousBlockHash: block.header.previousBlockHash.toString('hex'),
        },
        head: {
          sequence: node.chain.head.sequence,
        },
      })
    }

    const onAdd = async (header: BlockHeader) => {
      const block = await node.chain.getBlock(header)
      Assert.isNotNull(block)
      processBlock(block, 'connected')
    }

    const onRemove = async (header: BlockHeader) => {
      const block = await node.chain.getBlock(header)
      Assert.isNotNull(block)
      processBlock(block, 'disconnected')
    }

    const onFork = (block: Block) => {
      processBlock(block, 'fork')
    }

    const abortController = new AbortController()

    processor.onAdd.on(onAdd)
    processor.onRemove.on(onRemove)
    node.chain.onForkBlock.on(onFork)

    request.onClose.on(() => {
      abortController.abort()
      processor.onAdd.off(onAdd)
      processor.onRemove.off(onRemove)
      node.chain.onForkBlock.off(onFork)
    })

    while (!request.closed) {
      await processor.update({ signal: abortController.signal })
      await PromiseUtils.sleep(1000)
    }

    request.end()
  },
)
