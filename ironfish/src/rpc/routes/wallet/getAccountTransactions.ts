/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { IronfishNode } from '../../../node'
import { GENESIS_BLOCK_SEQUENCE } from '../../../primitives'
import { TransactionStatus, TransactionType } from '../../../wallet'
import { Account } from '../../../wallet/account/account'
import { TransactionValue } from '../../../wallet/walletdb/transactionValue'
import { RpcRequest } from '../../request'
import { RpcSpend, RpcSpendSchema } from '../chain'
import { ApiNamespace, routes } from '../router'
import { RpcWalletNote, RpcWalletNoteSchema } from './types'
import {
  getAccount,
  getAccountDecryptedNotes,
  getAssetBalanceDeltas,
  serializeRpcAccountTransaction,
} from './utils'

export type GetAccountTransactionsRequest = {
  account?: string
  hash?: string
  sequence?: number
  limit?: number
  offset?: number
  confirmations?: number
  notes?: boolean
  spends?: boolean
}

export type GetAccountTransactionsResponse = {
  hash: string
  status: TransactionStatus
  type: TransactionType
  confirmations: number
  fee: string
  blockHash?: string
  blockSequence?: number
  notesCount: number
  spendsCount: number
  mintsCount: number
  burnsCount: number
  expiration: number
  timestamp: number
  submittedSequence: number
  assetBalanceDeltas: Array<{ assetId: string; assetName: string; delta: string }>
  notes?: RpcWalletNote[]
  spends?: RpcSpend[]
}

export const GetAccountTransactionsRequestSchema: yup.ObjectSchema<GetAccountTransactionsRequest> =
  yup
    .object({
      account: yup.string().trim(),
      hash: yup.string().notRequired(),
      sequence: yup.number().min(GENESIS_BLOCK_SEQUENCE).notRequired(),
      limit: yup.number().notRequired(),
      offset: yup.number().notRequired(),
      confirmations: yup.number().notRequired(),
      notes: yup.boolean().notRequired().default(false),
      spends: yup.boolean().notRequired().default(false),
    })
    .defined()

export const GetAccountTransactionsResponseSchema: yup.ObjectSchema<GetAccountTransactionsResponse> =
  yup
    .object({
      hash: yup.string().defined(),
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
      expiration: yup.number().defined(),
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
    .defined()

routes.register<typeof GetAccountTransactionsRequestSchema, GetAccountTransactionsResponse>(
  `${ApiNamespace.wallet}/getAccountTransactions`,
  GetAccountTransactionsRequestSchema,
  async (request, { node }): Promise<void> => {
    Assert.isNotUndefined(node)

    const account = getAccount(node.wallet, request.data.account)

    const headSequence = (await account.getHead())?.sequence ?? null

    const options = {
      headSequence,
      confirmations: request.data.confirmations ?? node.config.get('confirmations'),
    }

    if (request.data.hash) {
      const hashBuffer = Buffer.from(request.data.hash, 'hex')

      const transaction = await account.getTransaction(hashBuffer)

      if (transaction) {
        await streamTransaction(request, node, account, transaction, options)
      }
      request.end()
      return
    }

    let count = 0
    let offset = 0

    const transactions = request.data.sequence
      ? account.getTransactionsBySequence(request.data.sequence)
      : account.getTransactionsByTime()

    for await (const transaction of transactions) {
      if (request.closed) {
        break
      }

      if (request.data.offset && offset < request.data.offset) {
        offset++
        continue
      }

      if (request.data.limit && count === request.data.limit) {
        break
      }

      await streamTransaction(request, node, account, transaction, options)
      count++
    }

    request.end()
  },
)

const streamTransaction = async (
  request: RpcRequest<GetAccountTransactionsRequest, GetAccountTransactionsResponse>,
  node: IronfishNode,
  account: Account,
  transaction: TransactionValue,
  options: {
    headSequence: number | null
    confirmations: number
  },
): Promise<void> => {
  const serializedTransaction = serializeRpcAccountTransaction(transaction)

  const assetBalanceDeltas = await getAssetBalanceDeltas(account, transaction)

  let notes = undefined
  if (request.data.notes) {
    notes = await getAccountDecryptedNotes(node.workerPool, account, transaction)
  }

  let spends = undefined
  if (request.data.spends) {
    spends = transaction.transaction.spends.map((spend) => ({
      nullifier: spend.nullifier.toString('hex'),
      commitment: spend.commitment.toString('hex'),
      size: spend.size,
    }))
  }

  const status = await node.wallet.getTransactionStatus(account, transaction, options)
  const type = await node.wallet.getTransactionType(account, transaction)

  const serialized = {
    ...serializedTransaction,
    assetBalanceDeltas,
    status,
    confirmations: options.confirmations,
    type,
    notes,
    spends,
  }

  request.stream(serialized)
}
