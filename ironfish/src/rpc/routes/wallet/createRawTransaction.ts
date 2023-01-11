/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { RawTransactionSerde } from '../../../primitives/rawTransaction'
import { ApiNamespace, router } from '../router'

export type CreateRawTransactionRequest = { transaction: string }

export type CreateRawTransactionResponse = {
  transaction: string
}

export const CreateRawTransactionRequestSchema: yup.ObjectSchema<CreateRawTransactionRequest> = yup
  .object({
    transaction: yup.string().defined(),
  })
  .defined()

export const CreateRawTransactionResponseSchema: yup.ObjectSchema<CreateRawTransactionResponse> = yup
  .object({
    transaction: yup.string().defined(),
  })
  .defined()

router.register<typeof CreateRawTransactionRequestSchema, CreateRawTransactionResponse>(
  `${ApiNamespace.wallet}/createRawTransaction`,
  CreateRawTransactionRequestSchema,
  async (request, node): Promise<void> => {
    const rawTransactionBytes = Buffer.from(request.data.transaction, 'hex')
    const rawTransaction = RawTransactionSerde.deserialize(rawTransactionBytes)
    const postedTransaction = await node.wallet.postTransaction(rawTransaction)
    const postedTransactionBytes = postedTransaction.serialize()

    request.end({ transaction: postedTransactionBytes.toString('hex') })
  },
)
