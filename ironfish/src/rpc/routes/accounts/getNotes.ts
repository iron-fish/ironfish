/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'
import { getAccount } from './utils'

export type GetAccountNotesRequest = { account?: string }

export type GetAccountNotesResponse = {
  account: string
  notes: {
    owner: boolean
    amount: number
    memo: string
    transactionHash: string
    spent: boolean | undefined
  }[]
}

export const GetAccountNotesRequestSchema: yup.ObjectSchema<GetAccountNotesRequest> = yup
  .object({
    account: yup.string().strip(true),
  })
  .defined()

export const GetAccountNotesResponseSchema: yup.ObjectSchema<GetAccountNotesResponse> = yup
  .object({
    account: yup.string().defined(),
    notes: yup
      .array(
        yup
          .object({
            owner: yup.boolean().defined(),
            amount: yup.number().defined(),
            memo: yup.string().trim().defined(),
            transactionHash: yup.string().defined(),
            spent: yup.boolean(),
          })
          .defined(),
      )
      .defined(),
  })
  .defined()

router.register<typeof GetAccountNotesRequestSchema, GetAccountNotesResponse>(
  `${ApiNamespace.account}/getAccountNotes`,
  GetAccountNotesRequestSchema,
  (request, node): void => {
    const account = getAccount(node, request.data.account)

    const responseNotes = []
    for (const { transaction } of account.getTransactions()) {
      responseNotes.push(...account.getTransactionNotes(transaction))
    }

    request.end({ account: account.displayName, notes: responseNotes })
  },
)
