/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'
import { getAccount } from './utils'

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
    spender: boolean
    amount: number
    memo: string
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
              spender: yup.boolean().defined(),
              amount: yup.number().defined(),
              memo: yup.string().trim().defined(),
            })
            .defined(),
        )
        .defined(),
    })
    .defined()

router.register<typeof GetAccountTransactionRequestSchema, GetAccountTransactionResponse>(
  `${ApiNamespace.account}/getAccountTransaction`,
  GetAccountTransactionRequestSchema,
  (request, node): void => {
    const account = getAccount(node, request.data.account)
    const { transactionInfo, transactionNotes } = node.accounts.getTransaction(
      account,
      request.data.hash,
    )
    request.end({
      account: account.displayName,
      transactionHash: request.data.hash,
      transactionInfo,
      transactionNotes,
    })
  },
)
