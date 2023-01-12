/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'

export type CreateRawTransactionRequest = {
  fromAccountName: string
  receives: {
    publicAddress: string
    amount: string
    memo: string
    assetId?: string
  }[]
  mints?: {
    assetId: string
    value: string
  }[]
  burns?: {
    assetId: string
    value: string
  }[]
  fee: string
  expiration?: number | null
  expirationDelta?: number | null
}

export type CreateRawTransactionResponse = {
  transaction: string
}

export const CreateRawTransactionRequestSchema: yup.ObjectSchema<CreateRawTransactionRequest> =
  yup
    .object({
      fromAccountName: yup.string().defined(),
      receives: yup
        .array(
          yup
            .object({
              publicAddress: yup.string().defined(),
              amount: yup.string().defined(),
              memo: yup.string().defined(),
              assetId: yup.string().optional(),
            })
            .defined(),
        )
        .defined(),
      mints: yup
        .array(
          yup
            .object({
              assetId: yup.string().defined(),
              value: yup.string().defined(),
            })
            .defined(),
        )
        .optional(),
      burns: yup
        .array(
          yup
            .object({
              assetId: yup.string().defined(),
              value: yup.string().defined(),
            })
            .defined(),
        )
        .optional(),
      fee: yup.string().defined(),
      expiration: yup.number().nullable().optional(),
      expirationDelta: yup.number().nullable().optional(),
    })
    .defined()

export const CreateRawTransactionResponseSchema: yup.ObjectSchema<CreateRawTransactionResponse> =
  yup
    .object({
      transaction: yup.string().defined(),
    })
    .defined()

router.register<typeof CreateRawTransactionRequestSchema, CreateRawTransactionResponse>(
  `${ApiNamespace.wallet}/createRawTransaction`,
  CreateRawTransactionRequestSchema,
  async (request, node): Promise<void> => {
    // const transaction = await node.wallet.createTransaction(request.options.sender, request.options.receives, request.options.fee, request.options.expiration)
    // const transactionBytes = transaction.serialize()
    // request.end({ transaction: transactionBytes.toString('hex') })
  },
)
