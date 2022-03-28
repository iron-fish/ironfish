/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Block } from '../../../primitives/block'
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

export type GetTransactionStreamRequest = { incomingViewKey: string }
export type GetTransactionStreamResponse = { transactions: Transaction[] }

export const GetTransactionStreamRequestSchema: yup.ObjectSchema<GetTransactionStreamRequest> =
  yup.object({ incomingViewKey: yup.string().required() }).required()
export const GetTransactionStreamResponseSchema: yup.ObjectSchema<GetTransactionStreamResponse> =
  yup
    .object({
      transactions: yup.array().of(TransactionSchema).required(),
    })
    .required()

router.register<typeof GetTransactionStreamRequestSchema, GetTransactionStreamResponse>(
  `${ApiNamespace.chain}/getTransactionStream`,
  GetTransactionStreamRequestSchema,
  async (request, node): Promise<void> => {
    // TODO: Some validation on this input
    const incomingViewKey = request.data.incomingViewKey

    const getTransactionsFromBlock = async (block: Block) => {
      const transactions: Transaction[] = []
      for (const tx of block.transactions) {
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

      if (transactions) {
        request.stream({ transactions: transactions })
      }
      return
    }

    const timeoutWrappedListener = (block: Block) => {
      setTimeout(() => {
        void getTransactionsFromBlock(block)
      })
    }

    node.chain.onConnectBlock.on(timeoutWrappedListener)

    request.onClose.once(() => {
      node.chain.onConnectBlock.off(timeoutWrappedListener)
    })
  },
)
