/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { RawTransactionSerde } from '../../../primitives/rawTransaction'
import { ApiNamespace, router } from '../router'
import { getAccount } from './utils'

export type PostTransactionRequest = {
  transaction: string
  account?: string
}

export type PostTransactionResponse = {
  transaction: string
  account: string
}

export const PostTransactionRequestSchema: yup.ObjectSchema<PostTransactionRequest> = yup
  .object({
    transaction: yup.string().defined(),
    account: yup.string().optional(),
  })
  .defined()

export const PostTransactionResponseSchema: yup.ObjectSchema<PostTransactionResponse> = yup
  .object({
    transaction: yup.string().defined(),
    account: yup.string().defined(),
  })
  .defined()

router.register<typeof PostTransactionRequestSchema, PostTransactionResponse>(
  `${ApiNamespace.wallet}/postTransaction`,
  PostTransactionRequestSchema,
  async (request, node): Promise<void> => {
    const account = getAccount(node, request.data.account)

    const rawTransactionBytes = Buffer.from(request.data.transaction, 'hex')
    const rawTransaction = RawTransactionSerde.deserialize(rawTransactionBytes)
    const postedTransaction = await node.wallet.postTransaction(rawTransaction, node.memPool)

    const postedTransactionBytes = postedTransaction.serialize()

    request.end({
      transaction: postedTransactionBytes.toString('hex'),
      account: account.name,
    })
  },
)
