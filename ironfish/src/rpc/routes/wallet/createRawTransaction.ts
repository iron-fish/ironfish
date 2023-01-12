/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'

export type CreateRawTransactionRequest = { 
  options: string  // TODO change fields to match the request
}

export type CreateRawTransactionResponse = {
  transaction: string
}

// TODO fixme
export const CreateRawTransactionRequestSchema: yup.ObjectSchema<CreateRawTransactionRequest> = yup
  .object({
    options: yup.string().defined(),
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
    // const rawTransactionBytes = Buffer.from(request.data.transaction, 'hex')
    // const rawTransaction = RawTransactionSerde.deserialize(rawTransactionBytes)
    // const postedTransaction = await node.wallet.postTransaction(rawTransaction)
    // const postedTransactionBytes = postedTransaction.serialize()

    // request.end({ transaction: postedTransactionBytes.toString('hex') })
    // wallet.createTransaction takes:
    // sender: Account, // this'll be a stringified public key
    // receives: {
    //   publicAddress: string 
    //   amount: string // becomes bigint
    //   memo: string
    //   assetId: string  
    // }[],
    // mints: MintDescription[], // value will be string -> bigint, asset will be string ID. see burnAsset and mintAsset
    // burns: BurnDescription[],
    // fee: string, // becomes bigint
    // expiration: number,

    // maybe start with a version that just supplies [] and [] for mints and burns
    // and then add the ability to specify them later
    // const transaction = await node.wallet.createTransaction(request.options.sender, request.options.receives, request.options.fee, request.options.expiration)
    // const transactionBytes = transaction.serialize()
    // request.end({ transaction: transactionBytes.toString('hex') })
  },
)
