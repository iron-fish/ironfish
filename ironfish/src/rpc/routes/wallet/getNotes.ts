/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'
import { RpcWalletNote, RpcWalletNoteSchema } from './types'
import { getAccount, serializeRpcWalletNote } from './utils'

const DEFAULT_PAGE_SIZE = 100

export type BigMinMax = {
  min?: string
  max?: string
}

export type GetNotesRequest = {
  account?: string
  pageSize?: number
  pageCursor?: string
  value?: BigMinMax
  assetId?: string
  assetName?: string
  memo?: string
  sender?: string
  noteHash?: string
  transactionHash?: string
  index?: number
  nullifier?: string
  spent?: boolean
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
    value: yup.object({
      min: yup.string(),
      max: yup.string(),
    }),
    assetId: yup.string(),
    assetName: yup.string(),
    memo: yup.string(),
    sender: yup.string(),
    noteHash: yup.string(),
    transactionHash: yup.string(),
    index: yup.number(),
    nullifier: yup.string(),
    spent: yup.boolean(),
>>>>>>> 05c2079f (adds filtering to wallet/getNotes endpoint)
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
      const asset = await account.getAsset(decryptedNote.note.assetId())

      const note = serializeRpcWalletNote(decryptedNote, account.publicAddress, asset)

      if (!includeNote(note, request.data)) {
        continue
      }

      notes.push(note)

      if (notes.length === pageSize) {
        nextPageCursor = node.wallet.walletDb.decryptedNotes.keyEncoding.serialize([
          account.prefix,
          decryptedNote.hash,
        ])

        break
      }
    }

    request.end({
      notes,
      nextPageCursor: nextPageCursor ? nextPageCursor.toString('hex') : null,
    })
  },
)

function includeNote(note: RpcWalletNote, request: GetNotesRequest): boolean {
  return (
    (request.value?.min === undefined || BigInt(note.value) >= BigInt(request.value.min)) &&
    (request.value?.max === undefined || BigInt(note.value) <= BigInt(request.value.max)) &&
    (request.assetId === undefined || note.assetId === request.assetId) &&
    (request.assetName === undefined || note.assetName === request.assetName) &&
    (request.memo === undefined || note.memo === request.memo) &&
    (request.sender === undefined || note.sender === request.sender) &&
    (request.noteHash === undefined || note.noteHash === request.noteHash) &&
    (request.transactionHash === undefined ||
      note.transactionHash === request.transactionHash) &&
    (request.index === undefined || note.index === request.index) &&
    (request.nullifier === undefined || note.nullifier === request.nullifier) &&
    (request.spent === undefined || note.spent === request.spent)
  )
}
