/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { BlockHashSerdeInstance } from '../../../serde'
import { CurrencyUtils } from '../../../utils'
import { ValidationError } from '../../adapters'
import { ApiNamespace, router } from '../router'

export type GetTransactionRequest = { blockHash: string; transactionHash: string }

export type GetTransactionResponse = {
  fee: string
  expiration: number
  notesCount: number
  spendsCount: number
  signature: string
  notesEncrypted: string[]
  mints: {
    assetId: string
    value: string
  }[]
  burns: {
    assetId: string
    value: string
  }[]
}
export const GetTransactionRequestSchema: yup.ObjectSchema<GetTransactionRequest> = yup
  .object({
    blockHash: yup.string().defined(),
    transactionHash: yup.string().defined(),
  })
  .defined()

export const GetTransactionResponseSchema: yup.ObjectSchema<GetTransactionResponse> = yup
  .object({
    fee: yup.string().defined(),
    expiration: yup.number().defined(),
    notesCount: yup.number().defined(),
    spendsCount: yup.number().defined(),
    signature: yup.string().defined(),
    notesEncrypted: yup.array(yup.string().defined()).defined(),
    mints: yup
      .array(
        yup
          .object({
            assetId: yup.string().defined(),
            value: yup.string().defined(),
          })
          .defined(),
      )
      .defined(),
    burns: yup
      .array(
        yup
          .object({
            assetId: yup.string().defined(),
            value: yup.string().defined(),
          })
          .defined(),
      )
      .defined(),
  })
  .defined()

router.register<typeof GetTransactionRequestSchema, GetTransactionResponse>(
  `${ApiNamespace.chain}/getTransaction`,
  GetTransactionRequestSchema,
  async (request, node): Promise<void> => {
    if (!request.data.blockHash || !request.data.transactionHash) {
      throw new ValidationError(`Missing block hash or transaction hash`)
    }
    const hashBuffer = BlockHashSerdeInstance.deserialize(request.data.blockHash)

    const block = await node.chain.getBlock(hashBuffer)
    if (!block) {
      throw new ValidationError(`No block found`)
    }

    // Empty response used for case that transaction not found
    const rawTransaction: GetTransactionResponse = {
      fee: '0',
      expiration: 0,
      notesCount: 0,
      spendsCount: 0,
      signature: '',
      notesEncrypted: [],
      mints: [],
      burns: [],
    }

    block.transactions.map((transaction) => {
      if (transaction.hash().toString('hex') === request.data.transactionHash) {
        const fee = transaction.fee().toString()
        const expiration = transaction.expiration()
        const signature = transaction.transactionSignature()
        const notesEncrypted = []

        for (const note of transaction.notes) {
          notesEncrypted.push(note.serialize().toString('hex'))
        }

        rawTransaction.fee = fee
        rawTransaction.expiration = expiration
        rawTransaction.notesCount = transaction.notes.length
        rawTransaction.spendsCount = transaction.spends.length
        rawTransaction.signature = signature.toString('hex')
        rawTransaction.notesEncrypted = notesEncrypted

        rawTransaction.mints = transaction.mints.map((mint) => ({
          assetId: mint.asset.id().toString('hex'),
          value: CurrencyUtils.encode(mint.value),
        }))

        rawTransaction.burns = transaction.burns.map((burn) => ({
          assetId: burn.assetId.toString('hex'),
          value: CurrencyUtils.encode(burn.value),
        }))
      }
    })

    request.end(rawTransaction)
  },
)
