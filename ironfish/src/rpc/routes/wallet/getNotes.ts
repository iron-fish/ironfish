/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { CurrencyUtils } from '../../../utils'
import { ApiNamespace, router } from '../router'
import { getAccount } from './utils'

export type GetAccountNotesStreamRequest = { account?: string }

export type GetAccountNotesStreamResponse = {
  value: string
  assetId: string
  assetName: string
  memo: string
  sender: string
  transactionHash: string
  spent: boolean | undefined
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
      value: yup.string().defined(),
      assetId: yup.string().defined(),
      assetName: yup.string().defined(),
      memo: yup.string().trim().defined(),
      sender: yup.string().defined(),
      transactionHash: yup.string().defined(),
      spent: yup.boolean(),
    })
    .defined()

router.register<typeof GetAccountNotesStreamRequestSchema, GetAccountNotesStreamResponse>(
  `${ApiNamespace.wallet}/getAccountNotesStream`,
  GetAccountNotesStreamRequestSchema,
  async (request, node): Promise<void> => {
    const account = getAccount(node, request.data.account)

    for await (const { note, spent, transactionHash } of account.getNotes()) {
      if (request.closed) {
        break
      }

      const transaction = await account.getTransaction(transactionHash)
      Assert.isNotUndefined(transaction)

      const asset = await node.chain.getAssetById(note.assetId())

      request.stream({
        value: CurrencyUtils.encode(note.value()),
        assetId: note.assetId().toString('hex'),
        assetName: asset?.name.toString('utf8') || '',
        memo: note.memo(),
        sender: note.sender(),
        transactionHash: transaction.transaction.hash().toString('hex'),
        spent,
      })
    }

    request.end()
  },
)
