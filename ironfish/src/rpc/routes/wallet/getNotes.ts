/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { BufferUtils } from '../../../utils'
import { ApiNamespace, router } from '../router'
import { RpcWalletNote, RpcWalletNoteSchema } from './types'
import { getAccount, serializeRpcWalletNote } from './utils'

const DEFAULT_PAGE_SIZE = 100

export type GetNotesRequest = {
  account?: string
  pageSize?: number
  pageCursor?: string
}

export type GetNotesResponse = {
  notes: Array<RpcWalletNote>
  nextPageCursor: string | null
}

export const GetNotesRequestSchema: yup.ObjectSchema<GetNotesRequest> = yup
  .object({
    account: yup.string().trim(),
    pageSize: yup.number().min(1),
    pageCursor: yup.string(),
  })
  .defined()

export const GetNotesResponseSchema: yup.ObjectSchema<GetNotesResponse> = yup
  .object({
    notes: yup.array(RpcWalletNoteSchema).defined(),
    nextPageCursor: yup.string(),
  })
  .defined()

router.register<typeof GetNotesRequestSchema, GetNotesResponse>(
  `${ApiNamespace.wallet}/getNotes`,
  GetNotesRequestSchema,
  async (request, node): Promise<void> => {
    const account = getAccount(node, request.data.account)
    const pageSize = request.data.pageSize ?? DEFAULT_PAGE_SIZE
    const pageCursor = request.data.pageCursor

    const keyRange = pageCursor ? { gte: Buffer.from(pageCursor, 'hex') } : undefined

    const notes = []
    let nextPageCursor: Buffer | null = null

    for await (const decryptedNote of account.getNotes(keyRange)) {
      if (notes.length === pageSize) {
        nextPageCursor = node.wallet.walletDb.decryptedNotes.keyEncoding.serialize([
          account.prefix,
          decryptedNote.hash,
        ])

        break
      }

      const asset = await account.getAsset(decryptedNote.note.assetId())

      notes.push(serializeRpcWalletNote(decryptedNote, account.publicAddress, asset))
    }

    request.end({
      notes,
      nextPageCursor: nextPageCursor ? nextPageCursor.toString('hex') : null,
    })
  },
)
