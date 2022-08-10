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
    amount: number
    memo: string
    noteTxHash: string
    spent: boolean
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
            amount: yup.number().defined(),
            memo: yup.string().trim().defined(),
            noteTxHash: yup.string().defined(),
            spent: yup.boolean().defined(),
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
    const notes = account.getNotes()
    const responseNotes = []

    for (const note of notes) {
      responseNotes.push({
        amount: Number(note.note.value()),
        memo: note.note.memo().replace(/\x00/g, ''),
        noteTxHash: note.transactionHash.toString('hex'),
        spent: note.spent,
      })
    }

    request.end({ account: account.displayName, notes: responseNotes })
  },
)
