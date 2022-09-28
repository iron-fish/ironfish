/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'
import { serializeRpcAccountTransaction } from './types'
import { getAccount, getTransactionStatus } from './utils'

export type GetAccountTransactionsStreamRequest = { account?: string }

export type GetAccountTransactionsStreamResponse = {
  account: string
  transaction: {
    creator: boolean
    status: string
    hash: string
    isMinersFee: boolean
    fee: string
    notesCount: number
    spendsCount: number
    expirationSequence: number
  }
}

export const GetAccountTransactionsStreamRequestSchema: yup.ObjectSchema<GetAccountTransactionsStreamRequest> =
  yup
    .object({
      account: yup.string().strip(true),
    })
    .defined()

export const GetAccountTransactionsStreamResponseSchema: yup.ObjectSchema<GetAccountTransactionsStreamResponse> =
  yup
    .object({
      account: yup.string().defined(),
      transaction: yup
        .object({
          creator: yup.boolean().defined(),
          status: yup.string().defined(),
          hash: yup.string().defined(),
          isMinersFee: yup.boolean().defined(),
          fee: yup.string().defined(),
          notesCount: yup.number().defined(),
          spendsCount: yup.number().defined(),
          expirationSequence: yup.number().defined(),
        })
        .defined(),
    })
    .defined()

router.register<
  typeof GetAccountTransactionsStreamRequestSchema,
  GetAccountTransactionsStreamResponse
>(
  `${ApiNamespace.account}/getAccountTransactions`,
  GetAccountTransactionsStreamRequestSchema,
  async (request, node): Promise<void> => {
    const account = getAccount(node, request.data.account)

    for await (const transaction of account.getTransactions()) {
      const serializedTransaction = serializeRpcAccountTransaction(transaction)

      let creator = false
      for (const spend of transaction.transaction.spends()) {
        const noteHash = await account.getNoteHash(spend.nullifier)

        if (noteHash) {
          creator = true
          break
        }
      }

      const status = await getTransactionStatus(
        node,
        transaction.blockHash,
        transaction.sequence,
        transaction.transaction.expirationSequence(),
      )

      const serialized = {
        ...serializedTransaction,
        creator,
        status,
      }

      request.stream({
        account: account.name,
        transaction: serialized,
      })
    }

    request.end()
  },
)
