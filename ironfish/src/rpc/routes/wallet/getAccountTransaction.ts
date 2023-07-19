/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { TransactionStatus, TransactionType } from '../../../wallet'
import { RpcSpend, RpcSpendSchema } from '../chain'
import { ApiNamespace, routes } from '../router'
import { RpcWalletNote, RpcWalletNoteSchema } from './types'
import {
  getAccount,
  getAccountDecryptedNotes,
  getAssetBalanceDeltas,
  serializeRpcAccountTransaction,
} from './utils'

export type GetAccountTransactionRequest = {
  hash: string
  account?: string
  confirmations?: number
}

export type GetAccountTransactionResponse = {
  account: string
  transaction: {
    hash: string
    status: TransactionStatus
    confirmations: number
    type: TransactionType
    fee: string
    blockHash?: string
    blockSequence?: number
    notesCount: number
    spendsCount: number
    mintsCount: number
    burnsCount: number
    timestamp: number
    submittedSequence: number
    assetBalanceDeltas: Array<{ assetId: string; assetName: string; delta: string }>
    notes: RpcWalletNote[]
    spends: RpcSpend[]
  } | null
}

export const GetAccountTransactionRequestSchema: yup.ObjectSchema<GetAccountTransactionRequest> =
  yup
    .object({
      account: yup.string(),
      hash: yup.string().defined(),
      confirmations: yup.string(),
    })
    .defined()

export const GetAccountTransactionResponseSchema: yup.ObjectSchema<GetAccountTransactionResponse> =
  yup
    .object({
      account: yup.string().defined(),
      transaction: yup
        .object({
          hash: yup.string().required(),
          status: yup.string().oneOf(Object.values(TransactionStatus)).defined(),
          confirmations: yup.number().defined(),
          type: yup.string().oneOf(Object.values(TransactionType)).defined(),
          fee: yup.string().defined(),
          blockHash: yup.string().optional(),
          blockSequence: yup.number().optional(),
          notesCount: yup.number().defined(),
          spendsCount: yup.number().defined(),
          mintsCount: yup.number().defined(),
          burnsCount: yup.number().defined(),
          timestamp: yup.number().defined(),
          submittedSequence: yup.number().defined(),
          assetBalanceDeltas: yup
            .array(
              yup
                .object({
                  assetId: yup.string().defined(),
                  assetName: yup.string().defined(),
                  delta: yup.string().defined(),
                })
                .defined(),
            )
            .defined(),
          notes: yup.array(RpcWalletNoteSchema).defined(),
          spends: yup.array(RpcSpendSchema).defined(),
        })
        .defined(),
    })
    .defined()

routes.register<typeof GetAccountTransactionRequestSchema, GetAccountTransactionResponse>(
  `${ApiNamespace.wallet}/getAccountTransaction`,
  GetAccountTransactionRequestSchema,
  async (request, { node }): Promise<void> => {
    Assert.isNotUndefined(node)

    const account = getAccount(node.wallet, request.data.account)

    const transactionHash = Buffer.from(request.data.hash, 'hex')

    const transaction = await account.getTransaction(transactionHash)

    if (!transaction) {
      return request.end({
        account: account.name,
        transaction: null,
      })
    }

    const serializedTransaction = serializeRpcAccountTransaction(transaction)

    const assetBalanceDeltas = await getAssetBalanceDeltas(account, transaction)

    const notes = await getAccountDecryptedNotes(node, account, transaction)

    const spends = transaction.transaction.spends.map((spend) => ({
      nullifier: spend.nullifier.toString('hex'),
      commitment: spend.commitment.toString('hex'),
      size: spend.size,
    }))

    const confirmations = request.data.confirmations ?? node.config.get('confirmations')

    const status = await node.wallet.getTransactionStatus(account, transaction, {
      confirmations,
    })

    const type = await node.wallet.getTransactionType(account, transaction)

    const serialized = {
      ...serializedTransaction,
      assetBalanceDeltas,
      notes,
      spends,
      status,
      type,
      confirmations,
    }

    request.end({
      account: account.name,
      transaction: serialized,
    })
  },
)
