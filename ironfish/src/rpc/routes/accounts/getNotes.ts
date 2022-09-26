/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'
import { getAccount, getTransactionNotes } from './utils'

export type GetAccountNotesStreamRequest = { account?: string }

export type GetAccountNotesStreamResponse = {
  account: string
  notes: {
    owner: boolean
    amount: number
    memo: string
    transactionHash: string
    spent: boolean | undefined
  }[]
}

export const GetAccountNotesStreamRequestSchema: yup.ObjectSchema<GetAccountNotesStreamRequest> =
  yup
    .object({
      account: yup.string().strip(true),
    })
    .defined()

export const GetAccountNotesStreamResponseSchema: yup.ObjectSchema<GetAccountNotesStreamResponse> =
  yup
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

router.register<typeof GetAccountNotesStreamRequestSchema, GetAccountNotesStreamResponse>(
  `${ApiNamespace.account}/getAccountNotesStream`,
  GetAccountNotesStreamRequestSchema,
  async (request, node): Promise<void> => {
    const account = getAccount(node, request.data.account)

    for await (const { transaction } of account.getTransactions()) {
      const notes = await getTransactionNotes(account, transaction)
      request.stream({ account: account.displayName, notes: [...notes] })
    }

    request.end()
  },
)
