/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Config } from '../../../fileStores'
import { GENESIS_BLOCK_SEQUENCE } from '../../../primitives'
import { Wallet } from '../../../wallet'
import { Account } from '../../../wallet/account/account'
import { TransactionValue } from '../../../wallet/walletdb/transactionValue'
import { RpcRequest } from '../../request'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { RpcWalletTransaction, RpcWalletTransactionSchema } from '../wallet/types'
import { serializeRpcWalletTransaction } from './serializers'
import { getAccount, getAccountDecryptedNotes } from './utils'

export type GetAccountTransactionsRequest = {
  account?: string
  hash?: string
  sequence?: number
  startSequence?: number
  endSequence?: number
  limit?: number
  offset?: number
  reverse?: boolean
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
      startSequence: yup.number().min(GENESIS_BLOCK_SEQUENCE).notRequired(),
      endSequence: yup.number().min(GENESIS_BLOCK_SEQUENCE).notRequired(),
      limit: yup.number().notRequired(),
      offset: yup.number().notRequired(),
      reverse: yup.boolean().notRequired().default(true),
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
    AssertHasRpcContext(request, node, 'wallet', 'config')

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
        await streamTransaction(
          request,
          node.config,
          node.wallet,
          account,
          transaction,
          options,
        )
      }
      request.end()
      return
    }

    let count = 0
    let offset = 0

    let transactions
    if (request.data.startSequence || request.data.endSequence) {
      transactions = account.getTransactionsBySequenceRange(
        request.data.startSequence,
        request.data.endSequence,
      )
    } else if (request.data.sequence) {
      transactions = account.getTransactionsBySequence(request.data.sequence)
    } else {
      transactions = account.getTransactionsByTime(undefined, { reverse: request.data.reverse })
    }

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

      await streamTransaction(request, node.config, node.wallet, account, transaction, options)
      count++
    }

    request.end()
  },
)

const streamTransaction = async (
  request: RpcRequest<GetAccountTransactionsRequest, GetAccountTransactionsResponse>,
  config: Config,
  wallet: Wallet,
  account: Account,
  transaction: TransactionValue,
  options: {
    headSequence: number | null
    confirmations: number
  },
): Promise<void> => {
  const serializedTransaction = await serializeRpcWalletTransaction(
    config,
    wallet,
    account,
    transaction,
    {
      confirmations: options.confirmations,
      serialized: request.data.serialized,
    },
  )

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
    notes,
    spends,
  }

  request.stream(serialized)
}
