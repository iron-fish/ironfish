/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { UnsignedTransaction } from '../../../primitives/unsignedTransaction'
import { BufferUtils } from '../../../utils/buffer'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { RpcUnsignedTransactionNote, RpcUnsignedTransactionNoteSchema } from './types'
import { getAccount } from './utils'

export type GetUnsignedTransactionNotesRequest = {
  account?: string
  unsignedTransaction: string
}

export type GetUnsignedTransactionNotesResponse = {
  receivedNotes: RpcUnsignedTransactionNote[]
  sentNotes: RpcUnsignedTransactionNote[]
}

export const GetUnsignedTransactionNotesRequestSchema: yup.ObjectSchema<GetUnsignedTransactionNotesRequest> =
  yup
    .object({
      account: yup.string().trim(),
      unsignedTransaction: yup.string().defined(),
    })
    .defined()

export const GetUnsignedTransactionNotesResponseSchema: yup.ObjectSchema<GetUnsignedTransactionNotesResponse> =
  yup
    .object({
      receivedNotes: yup.array(RpcUnsignedTransactionNoteSchema).defined(),
      sentNotes: yup.array(RpcUnsignedTransactionNoteSchema).defined(),
    })
    .defined()

routes.register<
  typeof GetUnsignedTransactionNotesRequestSchema,
  GetUnsignedTransactionNotesResponse
>(
  `${ApiNamespace.wallet}/getUnsignedTransactionNotes`,
  GetUnsignedTransactionNotesRequestSchema,
  (request, context): void => {
    AssertHasRpcContext(request, context, 'wallet')

    const account = getAccount(context.wallet, request.data.account)

    const unsignedTransaction = new UnsignedTransaction(
      Buffer.from(request.data.unsignedTransaction, 'hex'),
    )

    const receivedNotes: RpcUnsignedTransactionNote[] = []
    const sentNotes: RpcUnsignedTransactionNote[] = []

    for (const note of unsignedTransaction.notes) {
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
