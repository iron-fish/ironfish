/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'
import { getAccount } from './utils'

export type GetAccountNotesStreamRequest = { account?: string }

export type GetAccountNotesStreamResponse = {
  account: string
  note: {
    owner: boolean
    amount: number
    memo: string
    transactionHash: string
    spent: boolean | undefined
  }
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
      note: yup
        .object({
          owner: yup.boolean().defined(),
          amount: yup.number().defined(),
          memo: yup.string().trim().defined(),
          transactionHash: yup.string().defined(),
          spent: yup.boolean(),
        })
        .defined(),
    })
    .defined()

router.register<typeof GetAccountNotesStreamRequestSchema, GetAccountNotesStreamResponse>(
  `${ApiNamespace.account}/getAccountNotesStream`,
  GetAccountNotesStreamRequestSchema,
  async (request, node): Promise<void> => {
    const account = getAccount(node, request.data.account)

    for await (const { note, spent, transactionHash } of account.getNotes()) {
      request.stream({
        account: account.displayName,
        note: {
          owner: true,
          amount: Number(note.value()),
          memo: note.memo(),
          transactionHash: transactionHash.toString('hex'),
          spent,
        },
      })
    }

    request.end()
  },
)
