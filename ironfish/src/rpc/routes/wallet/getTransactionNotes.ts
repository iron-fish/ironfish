/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Transaction } from '../../../primitives/transaction'
import { BufferUtils } from '../../../utils/buffer'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { RpcTransactionNote, RpcTransactionNoteSchema } from './types'
import { getAccount } from './utils'

export type GetTransactionNotesRequest = {
  account?: string
  transaction: string
}

export type GetTransactionNotesResponse = {
  receivedNotes: RpcTransactionNote[]
  sentNotes: RpcTransactionNote[]
}

export const GetTransactionNotesRequestSchema: yup.ObjectSchema<GetTransactionNotesRequest> =
  yup
    .object({
      account: yup.string().trim(),
      transaction: yup.string().defined(),
    })
    .defined()

export const GetTransactionNotesResponseSchema: yup.ObjectSchema<GetTransactionNotesResponse> =
  yup
    .object({
      receivedNotes: yup.array(RpcTransactionNoteSchema).defined(),
      sentNotes: yup.array(RpcTransactionNoteSchema).defined(),
    })
    .defined()

routes.register<typeof GetTransactionNotesRequestSchema, GetTransactionNotesResponse>(
  `${ApiNamespace.wallet}/getTransactionNotes`,
  GetTransactionNotesRequestSchema,
  (request, context): void => {
    AssertHasRpcContext(request, context, 'wallet')

    const account = getAccount(context.wallet, request.data.account)

    const transaction = new Transaction(Buffer.from(request.data.transaction, 'hex'))

    const receivedNotes: RpcTransactionNote[] = []
    const sentNotes: RpcTransactionNote[] = []

    for (const note of transaction.notes) {
      const receivedNote = note.decryptNoteForOwner(account.incomingViewKey)
      if (receivedNote) {
        receivedNotes.push({
          assetId: receivedNote.assetId().toString('hex'),
          memo: BufferUtils.toHuman(receivedNote.memo()),
          noteHash: receivedNote.hash().toString('hex'),
          owner: receivedNote.owner(),
          sender: receivedNote.sender(),
          value: receivedNote.value().toString(),
        })
      }

      const sentNote = note.decryptNoteForSpender(account.outgoingViewKey)
      if (sentNote) {
        sentNotes.push({
          assetId: sentNote.assetId().toString('hex'),
          memo: BufferUtils.toHuman(sentNote.memo()),
          noteHash: sentNote.hash().toString('hex'),
          owner: sentNote.owner(),
          sender: sentNote.sender(),
          value: sentNote.value().toString(),
        })
      }
    }

    request.end({
      receivedNotes,
      sentNotes,
    })
  },
)
