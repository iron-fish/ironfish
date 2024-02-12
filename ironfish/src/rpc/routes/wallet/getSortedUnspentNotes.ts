/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { RpcWalletNote, RpcWalletNoteSchema } from './types'
import { getAccount, serializeRpcWalletNote } from './utils'

type GetSortedUnspentNotesRequestFilter = {
  assetId: string
  reverse?: boolean
}

export type GetSortedUnspentNotesRequest = {
  account?: string
  filter?: GetSortedUnspentNotesRequestFilter
}

export type GetSortedUnspentNotesResponse = {
  notes: RpcWalletNote[]
}

export const GetSortedUnspentNotesRequestSchema: yup.ObjectSchema<GetSortedUnspentNotesRequest> =
  yup.object({
    account: yup.string().trim(),
    filter: yup.object({
      assetId: yup.string().trim().required(),
      reverse: yup.boolean(),
    }),
  })

export const GetSortedUnspentNotesResponseSchema: yup.ObjectSchema<GetSortedUnspentNotesResponse> =
  yup.object({
    notes: yup.array(RpcWalletNoteSchema).defined(),
  })

routes.register<typeof GetSortedUnspentNotesRequestSchema, GetSortedUnspentNotesResponse>(
  `${ApiNamespace.wallet}/getSortedUnspentNotes`,
  GetSortedUnspentNotesRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet')

    const account = getAccount(context.wallet, request.data.account)

    for await (const note of account.getUnspentNotes(
      request.data.filter?.assetId,
      request.data.filter?.reverse,
    )) {
      if (request.closed) {
        break
      }

      request.stream(serializeRpcWalletNote(note))
    }
    )) {

    }

    request.end({
      notes: notes.map((note) => serializeRpcWalletNote(note)),
    })
  },
)
