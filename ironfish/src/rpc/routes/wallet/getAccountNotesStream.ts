/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { BufferUtils, CurrencyUtils } from '../../../utils'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { RpcWalletNote, RpcWalletNoteSchema } from './types'
import { getAccount } from './utils'

export type GetAccountNotesStreamRequest = { account?: string }

export type GetAccountNotesStreamResponse = RpcWalletNote

export const GetAccountNotesStreamRequestSchema: yup.ObjectSchema<GetAccountNotesStreamRequest> =
  yup
    .object({
      account: yup.string().trim(),
    })
    .defined()

export const GetAccountNotesStreamResponseSchema: yup.ObjectSchema<GetAccountNotesStreamResponse> =
  RpcWalletNoteSchema

routes.register<typeof GetAccountNotesStreamRequestSchema, GetAccountNotesStreamResponse>(
  `${ApiNamespace.wallet}/getAccountNotesStream`,
  GetAccountNotesStreamRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet')

    const account = getAccount(context.wallet, request.data.account)

    for await (const transaction of account.getTransactionsByTime()) {
      if (request.closed) {
        break
      }

      const notes = await account.getTransactionNotes(transaction.transaction)

      for (const { note, spent, index, nullifier } of notes) {
        if (request.closed) {
          break
        }

        const asset = await account.getAsset(note.assetId())

        request.stream({
          value: CurrencyUtils.encode(note.value()),
          assetId: note.assetId().toString('hex'),
          assetName: asset?.name.toString('hex') || '',
          memo: BufferUtils.toHuman(note.memo()),
          memoHex: note.memo().toString('hex'),
          sender: note.sender(),
          owner: note.owner(),
          noteHash: note.hash().toString('hex'),
          transactionHash: transaction.transaction.hash().toString('hex'),
          index,
          spent,
          nullifier: nullifier?.toString('hex') || null,
          isOwner: true,
          hash: note.hash().toString('hex'),
        })
      }
    }

    request.end()
  },
)
