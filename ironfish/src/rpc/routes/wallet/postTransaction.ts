/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { RawTransactionSerde } from '../../../primitives/rawTransaction'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { getAccount } from './utils'

export type PostTransactionRequest = {
  account?: string
  transaction: string
  broadcast?: boolean
}

export type PostTransactionResponse = {
  accepted?: boolean
  broadcasted?: boolean
  hash: string
  transaction: string
}

export const PostTransactionRequestSchema: yup.ObjectSchema<PostTransactionRequest> = yup
  .object({
    account: yup.string().trim(),
    transaction: yup.string().defined(),
    broadcast: yup.boolean().optional(),
  })
  .defined()

export const PostTransactionResponseSchema: yup.ObjectSchema<PostTransactionResponse> = yup
  .object({
    accepted: yup.bool().optional(),
    broadcasted: yup.bool().optional(),
    hash: yup.string().defined(),
    transaction: yup.string().defined(),
  })
  .defined()

routes.register<typeof PostTransactionRequestSchema, PostTransactionResponse>(
  `${ApiNamespace.wallet}/postTransaction`,
  PostTransactionRequestSchema,
  async (request, node): Promise<void> => {
    const account = getAccount(node.wallet, request.data.account)

    const bytes = Buffer.from(request.data.transaction, 'hex')
    const raw = RawTransactionSerde.deserialize(bytes)

    const { accepted, broadcasted, transaction } = await node.wallet.post({
      transaction: raw,
      account,
      broadcast: request.data.broadcast,
    })

    const serialized = transaction.serialize()
    request.end({
      accepted,
      broadcasted,
      hash: transaction.hash().toString('hex'),
      transaction: serialized.toString('hex'),
    })
  },
)
