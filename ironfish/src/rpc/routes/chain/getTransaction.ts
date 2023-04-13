/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { BlockHashSerdeInstance } from '../../../serde'
import { CurrencyUtils } from '../../../utils'
import { ValidationError } from '../../adapters'
import { ApiNamespace, router } from '../router'

export type GetTransactionRequest = { transactionHash: string; blockHash?: string }

export type GetTransactionResponse = {
  fee: string
  expiration: number
  noteSize: number
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
    transactionHash: yup.string().defined(),
    blockHash: yup.string(),
  })
  .defined()

export const GetTransactionResponseSchema: yup.ObjectSchema<GetTransactionResponse> = yup
  .object({
    fee: yup.string().defined(),
    expiration: yup.number().defined(),
    noteSize: yup.number().defined(),
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
    if (!request.data.transactionHash) {
      throw new ValidationError(`Missing transaction hash`)
    }

    const hashBuffer = request.data.blockHash
      ? BlockHashSerdeInstance.deserialize(request.data.blockHash)
      : await node.chain.getBlockHashByTransactionHash(
          Buffer.from(request.data.transactionHash, 'hex'),
        )

    if (!hashBuffer) {
      throw new ValidationError(
        `No block hash found for transaction hash ${request.data.transactionHash}`,
      )
    }

    const blockHeader = await node.chain.getHeader(hashBuffer)
    if (!blockHeader) {
      throw new ValidationError(`No block found`)
    }

    // Empty response used for case that transaction not found
    const rawTransaction: GetTransactionResponse = {
      fee: '0',
      expiration: 0,
      noteSize: 0,
      notesCount: 0,
      spendsCount: 0,
      signature: '',
      notesEncrypted: [],
      mints: [],
      burns: [],
    }
    const transactions = await node.chain.getBlockTransactions(blockHeader)

    transactions.map(({ transaction, initialNoteIndex }) => {
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
        rawTransaction.noteSize = initialNoteIndex + transaction.notes.length
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
