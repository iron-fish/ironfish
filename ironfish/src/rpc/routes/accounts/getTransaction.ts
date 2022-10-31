/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'
import { serializeRpcAccountDecryptedNote, serializeRpcAccountTransaction } from './types'
import { getAccount } from './utils'

export type GetAccountTransactionRequest = { account?: string; hash: string }

export type GetAccountTransactionResponse = {
  account: string
  transaction: {
    hash: string
    status: string
    isMinersFee: boolean
    fee: string
    blockHash?: string
    blockSequence?: number
    notesCount: number
    spendsCount: number
    notes: {
      value: string
      memo: string
      spent: boolean
    }[]
  } | null
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
      transaction: yup
        .object({
          hash: yup.string().required(),
          status: yup.string().defined(),
          isMinersFee: yup.boolean().defined(),
          fee: yup.string().defined(),
          blockHash: yup.string().optional(),
          blockSequence: yup.number().optional(),
          notesCount: yup.number().defined(),
          spendsCount: yup.number().defined(),
          notes: yup
            .array(
              yup
                .object({
                  value: yup.string().defined(),
                  memo: yup.string().trim().defined(),
                  spent: yup.boolean(),
                })
                .defined(),
            )
            .defined(),
        })
        .defined(),
    })
    .defined()

router.register<typeof GetAccountTransactionRequestSchema, GetAccountTransactionResponse>(
  `${ApiNamespace.account}/getAccountTransaction`,
  GetAccountTransactionRequestSchema,
  async (request, node): Promise<void> => {
    const account = getAccount(node, request.data.account)

    const transactionHash = Buffer.from(request.data.hash, 'hex')

    const transaction = await account.getTransactionByUnsignedHash(transactionHash)

    if (!transaction) {
      return request.end({
        account: account.name,
        transaction: null,
      })
    }

    const notes = await account.getTransactionNotes(transaction.transaction)

    const serializedNotes = notes.map(serializeRpcAccountDecryptedNote)
    const serializedTransaction = serializeRpcAccountTransaction(transaction)

    const status = await node.wallet.getTransactionStatus(account, transaction)

    const serialized = {
      ...serializedTransaction,
      notes: serializedNotes,
      status,
    }

    request.end({
      account: account.name,
      transaction: serialized,
    })
  },
)
