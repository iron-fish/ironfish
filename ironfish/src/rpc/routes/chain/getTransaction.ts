/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { BlockHashSerdeInstance } from '../../../serde'
import { ValidationError } from '../../adapters'
import { ApiNamespace, router } from '../router'

export type GetTransactionRequest = { blockHash: string; transactionHash: string }

export type GetTransactionResponse = {
  fee: string
  expirationSequence: number
  notesCount: number
  spendsCount: number
  signature: string
  notesEncrypted: string[]
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
    expirationSequence: yup.number().defined(),
    notesCount: yup.number().defined(),
    spendsCount: yup.number().defined(),
    signature: yup.string().defined(),
    notesEncrypted: yup.array(yup.string().defined()).defined(),
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
      expirationSequence: 0,
      notesCount: 0,
      spendsCount: 0,
      signature: '',
      notesEncrypted: [],
    }
    block.transactions.map((transaction) => {
      if (transaction.hash().toString('hex') === request.data.transactionHash) {
        const fee = transaction.fee().toString()
        const expirationSequence = transaction.expirationSequence()
        const notesCount = transaction.notesLength()
        const spendsCount = transaction.spendsLength()
        const signature = transaction.transactionSignature()
        const notesEncrypted = []
        for (const note of transaction.notes()) {
          notesEncrypted.push(note.serialize().toString('hex'))
        }
        rawTransaction.fee = fee
        rawTransaction.expirationSequence = expirationSequence
        rawTransaction.notesCount = notesCount
        rawTransaction.spendsCount = spendsCount
        rawTransaction.signature = signature.toString('hex')
        rawTransaction.notesEncrypted = notesEncrypted
      }
    })

    request.end(rawTransaction)
  },
)
