/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'
import { getAccount } from './utils'

export type GetAccountTransactionsRequest = { account?: string }

export type GetAccountTransactionsResponse = {
  account: string
  transactions: {
    creator: boolean
    status: string
    hash: string
    isMinersFee: boolean
    fee: number
    notes: number
    spends: number
  }[]
}

export const GetAccountTransactionsRequestSchema: yup.ObjectSchema<GetAccountTransactionsRequest> =
  yup
    .object({
      account: yup.string().strip(true),
    })
    .defined()

export const GetAccountTransactionsResponseSchema: yup.ObjectSchema<GetAccountTransactionsResponse> =
  yup
    .object({
      account: yup.string().defined(),
      transactions: yup
        .array(
          yup
            .object({
              creator: yup.boolean().defined(),
              status: yup.string().defined(),
              hash: yup.string().defined(),
              isMinersFee: yup.boolean().defined(),
              fee: yup.number().defined(),
              notes: yup.number().defined(),
              spends: yup.number().defined(),
            })
            .defined(),
        )
        .defined(),
    })
    .defined()

router.register<typeof GetAccountTransactionsRequestSchema, GetAccountTransactionsResponse>(
  `${ApiNamespace.account}/getAccountTransactions`,
  GetAccountTransactionsRequestSchema,
  (request, node): void => {
    const account = getAccount(node, request.data.account)
    const { transactions } = node.accounts.getTransactions(account)
    request.end({ account: account.displayName, transactions })
  },
)
