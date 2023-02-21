/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { Transaction } from '../../../primitives'
import { RawTransactionSerde } from '../../../primitives/rawTransaction'
import { ApiNamespace, router } from '../router'
import { getAccount } from './utils'

export type PostTransactionRequest = {
  account?: string
  transaction: string
  offline?: boolean
}

export type PostTransactionResponse = {
  transaction: string
}

export const PostTransactionRequestSchema: yup.ObjectSchema<PostTransactionRequest> = yup
  .object({
    account: yup.string().strip(true),
    transaction: yup.string().defined(),
    offline: yup.boolean().optional(),
  })
  .defined()

export const PostTransactionResponseSchema: yup.ObjectSchema<PostTransactionResponse> = yup
  .object({
    transaction: yup.string().defined(),
  })
  .defined()

router.register<typeof PostTransactionRequestSchema, PostTransactionResponse>(
  `${ApiNamespace.wallet}/postTransaction`,
  PostTransactionRequestSchema,
  async (request, node): Promise<void> => {
    const account = getAccount(node, request.data.sender)
    Assert.isNotNull(
      account.spendingKey,
      'Account must have spending key to post a transaction',
    )

    const bytes = Buffer.from(request.data.transaction, 'hex')
    const raw = RawTransactionSerde.deserialize(bytes)

    let postedTransaction: Transaction
    if (request.data.offline === true) {
      postedTransaction = await node.wallet.postTransaction(raw, account.spendingKey)
    } else {
      postedTransaction = await node.wallet.post({
        transaction: raw,
        account,
      })
    }

    const serialized = postedTransaction.serialize()
    request.end({ transaction: serialized.toString('hex') })
  },
)
