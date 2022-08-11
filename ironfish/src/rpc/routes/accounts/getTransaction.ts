/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Note } from '../../../primitives/note'
import { ApiNamespace, router } from '../router'
import { getAccount, getTransactionStatus } from './utils'

export type GetAccountTransactionRequest = { account?: string; hash: string }

export type GetAccountTransactionResponse = {
  account: string
  transactionHash: string
  transactionInfo: {
    status: string
    isMinersFee: boolean
    fee: number
    notes: number
    spends: number
  } | null
  transactionNotes: {
    amount: number
    memo: string
    spent: boolean
  }[]
}

export const GetAccountTransactionRequestSchema: yup.ObjectSchema<GetAccountTransactionRequest> =
  yup
    .object({
      account: yup.string().strip(true),
      hash: yup.string().defined(),
    })
    .defined()

export const GetAccountTransactionResponseSchema: yup.ObjectSchema<GetAccountTransactionResponse> =
  yup
    .object({
      account: yup.string().defined(),
      transactionHash: yup.string().defined(),
      transactionInfo: yup
        .object({
          status: yup.string().defined(),
          isMinersFee: yup.boolean().defined(),
          fee: yup.number().defined(),
          notes: yup.number().defined(),
          spends: yup.number().defined(),
        })
        .defined(),
      transactionNotes: yup
        .array(
          yup
            .object({
              amount: yup.number().defined(),
              memo: yup.string().trim().defined(),
              spent: yup.boolean().defined(),
            })
            .defined(),
        )
        .defined(),
    })
    .defined()

router.register<typeof GetAccountTransactionRequestSchema, GetAccountTransactionResponse>(
  `${ApiNamespace.account}/getAccountTransaction`,
  GetAccountTransactionRequestSchema,
  async (request, node): Promise<void> => {
    const account = getAccount(node, request.data.account)

    let transactionInfo = null
    const transactionNotes = []
    const transactionValue = account.getTransaction(Buffer.from(request.data.hash, 'hex'))

    if (transactionValue) {
      const { transaction, blockHash, sequence } = transactionValue

      transactionInfo = {
        status: await getTransactionStatus(
          node,
          blockHash,
          sequence,
          transaction.expirationSequence(),
        ),
        isMinersFee: transaction.isMinersFee(),
        fee: Number(transaction.fee()),
        notes: transaction.notesLength(),
        spends: transaction.spendsLength(),
      }

      for (const note of transaction.notes()) {
        // Try loading the note from the account
        const decryptedNoteValue = account.getDecryptedNote(note.merkleHash().toString('hex'))

        if (decryptedNoteValue) {
          const decryptedNote = new Note(decryptedNoteValue.serializedNote)

          if (decryptedNote.value() !== BigInt(0)) {
            transactionNotes.push({
              amount: Number(decryptedNote.value()),
              memo: decryptedNote.memo().replace(/\x00/g, ''),
              spent: decryptedNoteValue?.spent,
            })
          }
        }
      }
    }

    request.end({
      account: account.displayName,
      transactionHash: request.data.hash,
      transactionInfo,
      transactionNotes,
    })
  },
)
