/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { BlockHashSerdeInstance } from '../../../serde'
import { CurrencyUtils } from '../../../utils'
import { NotFoundError, ValidationError } from '../../adapters'
import {
  RpcBurn,
  RpcBurnSchema,
  RpcEncryptedNote,
  RpcEncryptedNoteSchema,
  RpcMint,
  RpcMintSchema,
} from '../../types'
import { ApiNamespace, routes } from '../router'
import { RpcSpend, RpcSpendSchema } from './types'

export type GetTransactionRequest = { transactionHash: string; blockHash?: string }

export type GetTransactionResponse = {
  fee: string
  expiration: number
  noteSize: number
  /**
   * @deprecated Please use `notes.length` instead
   */
  notesCount: number
  /**
   * @deprecated Please use `spends.length` instead
   */
  spendsCount: number
  signature: string
  spends: RpcSpend[]
  notes: RpcEncryptedNote[]
  mints: RpcMint[]
  burns: RpcBurn[]
  blockHash: string
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

export const GetTransactionResponseSchema: yup.ObjectSchema<GetTransactionResponse> = yup
  .object({
    fee: yup.string().defined(),
    expiration: yup.number().defined(),
    noteSize: yup.number().defined(),
    notesCount: yup.number().defined(),
    spendsCount: yup.number().defined(),
    signature: yup.string().defined(),
    notesEncrypted: yup.array(yup.string().defined()).defined(),
    spends: yup.array(RpcSpendSchema).defined(),
    notes: yup.array(RpcEncryptedNoteSchema).defined(),
    mints: yup.array(RpcMintSchema).defined(),
    burns: yup.array(RpcBurnSchema).defined(),
    blockHash: yup.string().defined(),
  })
  .defined()

routes.register<typeof GetTransactionRequestSchema, GetTransactionResponse>(
  `${ApiNamespace.chain}/getTransaction`,
  GetTransactionRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

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
      throw new NotFoundError(
        `No block found for block hash ${blockHashBuffer.toString('hex')}`,
      )
    }

    const transactions = await node.chain.getBlockTransactions(blockHeader)

    const foundTransaction = transactions.find(({ transaction }) =>
      transaction.hash().equals(transactionHashBuffer),
    )

    if (!foundTransaction) {
      throw new NotFoundError(
        `Transaction not found on block ${blockHashBuffer.toString('hex')}`,
      )
    }

    const { transaction, initialNoteIndex } = foundTransaction

    const rawTransaction: GetTransactionResponse = {
      fee: transaction.fee().toString(),
      expiration: transaction.expiration(),
      noteSize: initialNoteIndex + transaction.notes.length,
      notesCount: transaction.notes.length,
      spendsCount: transaction.spends.length,
      signature: transaction.transactionSignature().toString('hex'),
      notesEncrypted: transaction.notes.map((note) => note.serialize().toString('hex')),
      notes: transaction.notes.map((note) => ({
        commitment: note.hash().toString('hex'),
        hash: note.hash().toString('hex'),
        serialized: note.serialize().toString('hex'),
      })),
      mints: transaction.mints.map((mint) => ({
        assetId: mint.asset.id().toString('hex'),
        id: mint.asset.id().toString('hex'),
        assetName: mint.asset.name().toString('hex'),
        value: CurrencyUtils.encode(mint.value),
        name: mint.asset.name().toString('hex'),
        metadata: mint.asset.metadata().toString('hex'),
        creator: mint.asset.creator().toString('hex'),
        transferOwnershipTo: mint.transferOwnershipTo?.toString('hex'),
      })),
      burns: transaction.burns.map((burn) => ({
        assetId: burn.assetId.toString('hex'),
        id: burn.assetId.toString('hex'),
        assetName: '',
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
  },
)
