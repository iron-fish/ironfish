/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { RpcWalletNote, RpcWalletNoteSchema } from './types'
import { getAccount, serializeRpcWalletNote } from './utils'

const DEFAULT_PAGE_SIZE = 100

type StringMinMax = {
  min?: string
  max?: string
}

type GetNotesRequestFilter = {
  value?: StringMinMax
  assetId?: string
  memo?: string
  sender?: string
  noteHash?: string
  transactionHash?: string
  index?: number
  nullifier?: string
  spent?: boolean
}

export type GetNotesRequest = {
  sortByValue?: 'asc' | 'desc'
  account?: string
  pageSize?: number
  pageCursor?: string
  filter?: GetNotesRequestFilter
}

export type GetNotesResponse = {
  notes: RpcWalletNote[]
  nextPageCursor: string | null
}

export const GetNotesRequestSchema: yup.ObjectSchema<GetNotesRequest> = yup
  .object({
    sortByValue: yup.string().oneOf(['asc', 'desc']).optional(),
    account: yup.string().trim(),
    pageSize: yup.number().min(1),
    pageCursor: yup.string(),
    filter: yup
      .object({
        value: yup.object({
          min: yup.string(),
          max: yup.string(),
        }),
        assetId: yup.string(),
        memo: yup.string(),
        sender: yup.string(),
        noteHash: yup.string(),
        transactionHash: yup.string(),
        index: yup.number(),
        nullifier: yup.string(),
        spent: yup.boolean(),
      })
      .defined(),
  })
  .defined()

export const GetNotesResponseSchema: yup.ObjectSchema<GetNotesResponse> = yup
  .object({
    notes: yup.array(RpcWalletNoteSchema).defined(),
    nextPageCursor: yup.string(),
  })
  .defined()

routes.register<typeof GetNotesRequestSchema, GetNotesResponse>(
  `${ApiNamespace.wallet}/getNotes`,
  GetNotesRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet')

    const account = getAccount(context.wallet, request.data.account)
    const pageSize = request.data.pageSize ?? DEFAULT_PAGE_SIZE
    const pageCursor = request.data.pageCursor

    const keyRange = pageCursor ? { gte: Buffer.from(pageCursor, 'hex') } : undefined

    const notes = []
    let nextPageCursor: Buffer | null = null

    // is sortByValue is used, we need assetId to be defined and spent to be false
    if (
      request.data.sortByValue &&
      (request.data.filter?.assetId === undefined || request.data.filter?.spent === true)
    ) {
      throw new Error('sortByValue requires assetId and spent to be defined.')
    }

    const iterator =
      request.data.sortByValue && request.data.filter?.assetId && !request.data.filter?.spent
        ? account.getSortedByValueNotes(request.data.sortByValue, request.data.filter?.assetId)
        : account.getNotes(keyRange)

    for await (const decryptedNote of iterator) {
      if (notes.length === pageSize) {
        nextPageCursor = context.wallet.walletDb.decryptedNotes.keyEncoding.serialize([
          account.prefix,
          decryptedNote.hash,
        ])

        break
      }

      const asset = await account.getAsset(decryptedNote.note.assetId())

      const note = serializeRpcWalletNote(decryptedNote, account.publicAddress, asset)

      if (!includeNote(note, request.data.filter ?? {})) {
        continue
      }

      notes.push(note)
    }

    request.end({
      notes,
      nextPageCursor: nextPageCursor ? nextPageCursor.toString('hex') : null,
    })
  },
)

function includeNote(note: RpcWalletNote, filter: GetNotesRequestFilter): boolean {
  return (
    (filter.value?.min === undefined || BigInt(note.value) >= BigInt(filter.value.min)) &&
    (filter.value?.max === undefined || BigInt(note.value) <= BigInt(filter.value.max)) &&
    (filter.assetId === undefined || note.assetId === filter.assetId) &&
    (filter.memo === undefined || note.memo === filter.memo) &&
    (filter.sender === undefined || note.sender === filter.sender) &&
    (filter.noteHash === undefined || note.noteHash === filter.noteHash) &&
    (filter.transactionHash === undefined || note.transactionHash === filter.transactionHash) &&
    (filter.index === undefined || note.index === filter.index) &&
    (filter.nullifier === undefined || note.nullifier === filter.nullifier) &&
    (filter.spent === undefined || note.spent === filter.spent)
  )
}
