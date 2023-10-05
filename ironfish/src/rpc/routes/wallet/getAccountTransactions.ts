/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { GENESIS_BLOCK_SEQUENCE } from '../../../primitives'
import { IronfishNode } from '../../../utils'
import { Account } from '../../../wallet/account/account'
import { TransactionValue } from '../../../wallet/walletdb/transactionValue'
import { RpcRequest } from '../../request'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { RpcWalletTransaction, RpcWalletTransactionSchema } from '../wallet/types'
import {
  getAccount,
  getAccountDecryptedNotes,
  getAssetBalanceDeltas,
  serializeRpcWalletTransaction,
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
  serialized?: boolean
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
      serialized: yup.boolean().notRequired().default(false),
    })
    .defined()

export type GetAccountTransactionsResponse = RpcWalletTransaction

export const GetAccountTransactionsResponseSchema: yup.ObjectSchema<GetAccountTransactionsResponse> =
  RpcWalletTransactionSchema.defined()

routes.register<typeof GetAccountTransactionsRequestSchema, GetAccountTransactionsResponse>(
  `${ApiNamespace.wallet}/getAccountTransactions`,
  GetAccountTransactionsRequestSchema,
  async (request, node): Promise<void> => {
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
  const wallet = node.wallet

  const serializedTransaction = await serializeRpcWalletTransaction(
    node,
    account,
    transaction,
    {
      confirmations: options.confirmations,
      serialized: request.data.serialized,
    },
  )

  const assetBalanceDeltas = await getAssetBalanceDeltas(account, transaction)

  let notes = undefined
  if (request.data.notes) {
    notes = await getAccountDecryptedNotes(wallet.workerPool, account, transaction)
  }

  let spends = undefined
  if (request.data.spends) {
    spends = transaction.transaction.spends.map((spend) => ({
      nullifier: spend.nullifier.toString('hex'),
      commitment: spend.commitment.toString('hex'),
      size: spend.size,
    }))
  }

  const serialized = {
    ...serializedTransaction,
    assetBalanceDeltas,
    notes,
    spends,
  }

  request.stream(serialized)
}
