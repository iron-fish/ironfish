/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { IronfishNode } from '../../../node'
import { Account } from '../../../wallet/account'
import { TransactionValue } from '../../../wallet/walletdb/transactionValue'
import { RpcRequest } from '../../request'
import { ApiNamespace, router } from '../router'
import { getAssetBalanceDeltas, serializeRpcAccountTransaction } from './types'
import { getAccount } from './utils'

export type GetAccountTransactionsRequest = {
  account?: string
  hash?: string
  limit?: number
  offset?: number
  confirmations?: number
}

export type GetAccountTransactionsResponse = {
  status: string
  type: string
  hash: string
  fee: string
  notesCount: number
  spendsCount: number
  mintsCount: number
  burnsCount: number
  expiration: number
  timestamp: number
  assetBalanceDeltas: Array<{ assetId: string; assetName: string; delta: string }>
}

export const GetAccountTransactionsRequestSchema: yup.ObjectSchema<GetAccountTransactionsRequest> =
  yup
    .object({
      account: yup.string().strip(true),
      hash: yup.string().notRequired(),
      limit: yup.number().notRequired(),
      offset: yup.number().notRequired(),
      confirmations: yup.number().notRequired(),
    })
    .defined()

export const GetAccountTransactionsResponseSchema: yup.ObjectSchema<GetAccountTransactionsResponse> =
  yup
    .object({
      status: yup.string().defined(),
      type: yup.string().defined(),
      hash: yup.string().defined(),
      fee: yup.string().defined(),
      notesCount: yup.number().defined(),
      spendsCount: yup.number().defined(),
      mintsCount: yup.number().defined(),
      burnsCount: yup.number().defined(),
      expiration: yup.number().defined(),
      timestamp: yup.number().defined(),
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
    })
    .defined()

router.register<typeof GetAccountTransactionsRequestSchema, GetAccountTransactionsResponse>(
  `${ApiNamespace.wallet}/getAccountTransactions`,
  GetAccountTransactionsRequestSchema,
  async (request, node): Promise<void> => {
    const account = getAccount(node, request.data.account)

    const headSequence = (await account.getHead())?.sequence ?? null

    const options = {
      headSequence,
      confirmations: request.data.confirmations,
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

    for await (const transaction of account.getTransactionsByTime()) {
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
  options?: {
    headSequence?: number | null
    confirmations?: number
  },
): Promise<void> => {
  const serializedTransaction = serializeRpcAccountTransaction(transaction)

  const assetBalanceDeltas = await getAssetBalanceDeltas(node, transaction)

  const status = await node.wallet.getTransactionStatus(account, transaction, options)
  const type = await node.wallet.getTransactionType(account, transaction)

  const serialized = {
    ...serializedTransaction,
    assetBalanceDeltas,
    status,
    type,
  }

  request.stream(serialized)
}
