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
  pageToken?: string
}

export type GetNotesResponse = {
  notes: Array<RpcWalletNote>
  nextPageToken: string | null
}

export const GetNotesRequestSchema: yup.ObjectSchema<GetNotesRequest> = yup
  .object({
    account: yup.string().trim(),
    pageSize: yup.number().min(1),
    pageToken: yup.string(),
  })
  .defined()

export const GetNotesResponseSchema: yup.ObjectSchema<GetNotesResponse> = yup
  .object({
    notes: yup.array(RpcWalletNoteSchema).defined(),
    nextPageToken: yup.string(),
  })
  .defined()

router.register<typeof GetNotesRequestSchema, GetNotesResponse>(
  `${ApiNamespace.wallet}/getNotes`,
  GetNotesRequestSchema,
  async (request, node): Promise<void> => {
    const account = getAccount(node, request.data.account)
    const pageSize = request.data.pageSize ?? DEFAULT_PAGE_SIZE
    const pageToken = request.data.pageToken

    const keyRange = pageToken ? { gte: Buffer.from(pageToken, 'hex') } : undefined

    const notes = []
    let nextPageToken: Buffer | null = null

    for await (const decryptedNote of account.getNotes(keyRange)) {
      const asset = await account.getAsset(decryptedNote.note.assetId())

      notes.push(serializeRpcWalletNote(decryptedNote, account.publicAddress, asset))

      if (notes.length === pageSize) {
        nextPageToken = node.wallet.walletDb.decryptedNotes.keyEncoding.serialize([
          account.prefix,
          decryptedNote.hash,
        ])
        BufferUtils.incrementBE(nextPageToken)

        break
      }
    }

    request.end({
      notes,
      nextPageToken: nextPageToken ? nextPageToken.toString('hex') : null,
    })
  },
)
