/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { IronfishNode } from '../../../node'
import { BlockHashSerdeInstance } from '../../../serde'
import { CurrencyUtils } from '../../../utils'
import { NotFoundError, ValidationError } from '../../adapters'
import { RpcRequest } from '../../request'
import { RpcSpend, RpcSpendSchema } from '../wallet/types'
import { RpcNote, RpcNoteSchema } from './types'

export type Request = { transactionHash: string; blockHash?: string }

export type Response = {
  fee: string
  expiration: number
  noteSize: number
  notesCount: number
  spendsCount: number
  signature: string
  spends: RpcSpend[]
  notes: RpcNote[]
  mints: {
    assetId: string
    value: string
  }[]
  burns: {
    assetId: string
    value: string
  }[]
  blockHash: string
  /**
   * @deprecated Please use `notes` instead
   */
  notesEncrypted: string[]
}

export const RequestSchema: yup.ObjectSchema<Request> = yup
  .object({
    transactionHash: yup.string().defined(),
    blockHash: yup.string(),
  })
  .defined()

export const ResponseSchema: yup.ObjectSchema<Response> = yup
  .object({
    fee: yup.string().defined(),
    expiration: yup.number().defined(),
    noteSize: yup.number().defined(),
    notesCount: yup.number().defined(),
    spendsCount: yup.number().defined(),
    signature: yup.string().defined(),
    notesEncrypted: yup.array(yup.string().defined()).defined(),
    spends: yup.array(RpcSpendSchema).defined(),
    notes: yup.array(RpcNoteSchema).defined(),
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
    blockHash: yup.string().defined(),
  })
  .defined()

export const route = 'getTransaction'
export const handle = async (
  request: RpcRequest<Request, Response>,
  node: IronfishNode,
): Promise<void> => {
  if (!request.data.transactionHash) {
    throw new ValidationError(`Missing transaction hash`)
  }

  const transactionHashBuffer = Buffer.from(request.data.transactionHash, 'hex')

  const blockHashBuffer = request.data.blockHash
    ? BlockHashSerdeInstance.deserialize(request.data.blockHash)
    : await node.chain.getBlockHashByTransactionHash(transactionHashBuffer)

  if (!blockHashBuffer) {
    throw new NotFoundError(
      `No block hash found for transaction hash ${request.data.transactionHash}`,
    )
  }

  const blockHeader = await node.chain.getHeader(blockHashBuffer)
  if (!blockHeader) {
    throw new NotFoundError(`No block found for block hash ${blockHashBuffer.toString('hex')}`)
  }

  const transactions = await node.chain.getBlockTransactions(blockHeader)

  const foundTransaction = transactions.find(({ transaction }) =>
    transaction.hash().equals(transactionHashBuffer),
  )

  if (!foundTransaction) {
    throw new NotFoundError(`Transaction not found on block ${blockHashBuffer.toString('hex')}`)
  }

  const { transaction, initialNoteIndex } = foundTransaction

  const rawTransaction: Response = {
    fee: transaction.fee().toString(),
    expiration: transaction.expiration(),
    noteSize: initialNoteIndex + transaction.notes.length,
    notesCount: transaction.notes.length,
    spendsCount: transaction.spends.length,
    signature: transaction.transactionSignature().toString('hex'),
    notesEncrypted: transaction.notes.map((note) => note.serialize().toString('hex')),
    notes: transaction.notes.map((note) => ({
      hash: note.hash().toString('hex'),
      serialized: note.serialize().toString('hex'),
    })),
    mints: transaction.mints.map((mint) => ({
      assetId: mint.asset.id().toString('hex'),
      value: CurrencyUtils.encode(mint.value),
    })),
    burns: transaction.burns.map((burn) => ({
      assetId: burn.assetId.toString('hex'),
      value: CurrencyUtils.encode(burn.value),
    })),
    spends: transaction.spends.map((spend) => ({
      nullifier: spend.nullifier.toString('hex'),
      commitment: spend.commitment.toString('hex'),
      size: spend.size,
    })),
    blockHash: blockHashBuffer.toString('hex'),
  }

  request.end(rawTransaction)
}
