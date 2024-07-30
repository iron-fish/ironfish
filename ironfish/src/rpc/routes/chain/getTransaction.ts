/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { BlockHashSerdeInstance } from '../../../serde'
import { RpcNotFoundError, RpcValidationError } from '../../adapters'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { serializeRpcTransaction } from './serializers'
import { RpcTransaction, RpcTransactionSchema } from './types'

export type GetTransactionRequest = { transactionHash: string; blockHash?: string }

export type GetTransactionResponse = RpcTransaction & {
  noteSize: number
  blockHash: string
  /**
   * @deprecated Please use `notes.length` instead
   */
  notesCount: number
  /**
   * @deprecated Please use `spends.length` instead
   */
  spendsCount: number
  /**
   * @deprecated Please use `notes` instead
   */
  notesEncrypted: string[]
}

export const GetTransactionRequestSchema: yup.ObjectSchema<GetTransactionRequest> = yup
  .object({
    transactionHash: yup.string().defined(),
    blockHash: yup.string(),
  })
  .defined()

export const GetTransactionResponseSchema: yup.ObjectSchema<GetTransactionResponse> =
  RpcTransactionSchema.concat(
    yup
      .object({
        notesCount: yup.number().defined(),
        spendsCount: yup.number().defined(),
        notesEncrypted: yup.array(yup.string().defined()).defined(),
        noteSize: yup.number().defined(),
        blockHash: yup.string().defined(),
      })
      .defined(),
  )

routes.register<typeof GetTransactionRequestSchema, GetTransactionResponse>(
  `${ApiNamespace.chain}/getTransaction`,
  GetTransactionRequestSchema,
  async (request, context): Promise<void> => {
    Assert.isInstanceOf(context, FullNode)

    if (!request.data.transactionHash) {
      throw new RpcValidationError(`Missing transaction hash`)
    }

    const transactionHashBuffer = Buffer.from(request.data.transactionHash, 'hex')

    const blockHashBuffer = request.data.blockHash
      ? BlockHashSerdeInstance.deserialize(request.data.blockHash)
      : await context.chain.getBlockHashByTransactionHash(transactionHashBuffer)

    if (!blockHashBuffer) {
      throw new RpcNotFoundError(
        `No block hash found for transaction hash ${request.data.transactionHash}`,
      )
    }

    const blockHeader = await context.chain.getHeader(blockHashBuffer)
    if (!blockHeader) {
      throw new RpcNotFoundError(
        `No block found for block hash ${blockHashBuffer.toString('hex')}`,
      )
    }

    const transactions = await context.chain.getBlockTransactions(blockHeader)

    const chainTransaction = transactions.find(({ transaction }) =>
      transaction.hash().equals(transactionHashBuffer),
    )

    if (!chainTransaction) {
      throw new RpcNotFoundError(
        `Transaction not found on block ${blockHashBuffer.toString('hex')}`,
      )
    }

    request.end({
      ...serializeRpcTransaction(chainTransaction.transaction, true),
      blockHash: blockHashBuffer.toString('hex'),
      noteSize: chainTransaction.initialNoteIndex + chainTransaction.transaction.notes.length,
      notesCount: chainTransaction.transaction.notes.length,
      spendsCount: chainTransaction.transaction.spends.length,
      notesEncrypted: chainTransaction.transaction.notes.map((note) =>
        note.serialize().toString('hex'),
      ),
    })
  },
)
