/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { getAccount } from '../accounts/utils'
import { ApiNamespace, router } from '../router'

export type GetTransactionsRequest = { account?: string }

export type GetTransactionsResponse = {
  account: string
  notes: {
    isSpender: boolean
    txHash: string
    txFee: string
    isMinerFee: boolean
    amount: string
    memo: string
  }[]
}

export const GetTransactionsRequestSchema: yup.ObjectSchema<GetTransactionsRequest> = yup
  .object({
    account: yup.string().strip(true),
  })
  .defined()

export const GetTransactionsResponseSchema: yup.ObjectSchema<GetTransactionsResponse> = yup
  .object({
    account: yup.string().defined(),
    notes: yup
      .array(
        yup
          .object({
            isSpender: yup.boolean().defined(),
            txHash: yup.string().defined(),
            txFee: yup.string().defined(),
            isMinerFee: yup.boolean().defined(),
            amount: yup.string().defined(),
            memo: yup.string().trim().defined(),
          })
          .defined(),
      )
      .defined(),
  })
  .defined()

router.register<typeof GetTransactionsRequestSchema, GetTransactionsResponse>(
  `${ApiNamespace.transaction}/getTransactionNotes`,
  GetTransactionsRequestSchema,
  (request, node): void => {
    const account = getAccount(node, request.data.account)
    const { notes } = node.accounts.getTransactionNotes(account)
    request.end({ account: account.displayName, notes })
  },
)
