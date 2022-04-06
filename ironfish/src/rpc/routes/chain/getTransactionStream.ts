/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { ChainProcessor } from '../../../chainProcessor'
import { Block } from '../../../primitives/block'
import { BlockHeader } from '../../../primitives/blockheader'
import { PromiseUtils } from '../../../utils/promise'
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
export type GetTransactionStreamResponse = { type: string; transactions: Transaction[] }

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
    })
    .required()

router.register<typeof GetTransactionStreamRequestSchema, GetTransactionStreamResponse>(
  `${ApiNamespace.chain}/getTransactionStream`,
  GetTransactionStreamRequestSchema,
  async (request, node): Promise<void> => {
    // TODO: Some validation on this input
    const incomingViewKey = request.data.incomingViewKey
    const head = request.data.head ? Buffer.from(request.data.head, 'hex') : null

    const processor = new ChainProcessor({
      chain: node.chain,
      logger: node.logger,
      head: head,
    })

    const getTransactionsFromBlock = async (block: Block, type: string) => {
      const transactions: Transaction[] = []
      for (const tx of block.transactions) {
        if (await tx.isMinersFee()) {
          continue
        }
        const transaction: Transaction = {
          hash: tx.hash().toString('hex'),
          isMinersFee: await tx.isMinersFee(),
          notes: [],
        }
        for (const note of tx.notes()) {
          const decryptedNote = note.decryptNoteForOwner(incomingViewKey)
          if (decryptedNote) {
            transaction.notes.push({
              amount: decryptedNote.value().toString(),
              memo: decryptedNote.memo(),
            })
          }
        }

        transactions.push(transaction)
      }

      if (transactions.length) {
        request.stream({ type, transactions })
      }
      return
    }

    const onAdd = async (header: BlockHeader) => {
      const block = await node.chain.getBlock(header)
      Assert.isNotNull(block)
      await getTransactionsFromBlock(block, 'connected')
    }

    const onRemove = async (header: BlockHeader) => {
      const block = await node.chain.getBlock(header)
      Assert.isNotNull(block)
      await getTransactionsFromBlock(block, 'disconnected')
    }

    const onFork = async (block: Block) => {
      await getTransactionsFromBlock(block, 'fork')
    }

    processor.onAdd.on(onAdd)
    processor.onRemove.on(onRemove)
    node.chain.onForkBlock.on(onFork)
    const abortController = new AbortController()

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
