/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import FastPriorityQueue from 'fastpriorityqueue'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { IronfishNode } from '../../../node'
import { Account } from '../../../wallet/account'
import { TransactionValue } from '../../../wallet/walletdb/transactionValue'
import { RpcRequest } from '../../request'
import { ApiNamespace, router } from '../router'
import { serializeRpcAccountTransaction } from './types'
import { getAccount } from './utils'

export type GetAccountTransactionsRequest = { account?: string; hash?: string; limit?: number }

export type GetAccountTransactionsResponse = {
  creator: boolean
  status: string
  hash: string
  isMinersFee: boolean
  fee: string
  notesCount: number
  spendsCount: number
  expirationSequence: number
}

export const GetAccountTransactionsRequestSchema: yup.ObjectSchema<GetAccountTransactionsRequest> =
  yup
    .object({
      account: yup.string().strip(true),
      hash: yup.string().notRequired(),
      limit: yup.number().notRequired(),
    })
    .defined()

export const GetAccountTransactionsResponseSchema: yup.ObjectSchema<GetAccountTransactionsResponse> =
  yup
    .object({
      creator: yup.boolean().defined(),
      status: yup.string().defined(),
      hash: yup.string().defined(),
      isMinersFee: yup.boolean().defined(),
      fee: yup.string().defined(),
      notesCount: yup.number().defined(),
      spendsCount: yup.number().defined(),
      expirationSequence: yup.number().defined(),
    })
    .defined()

router.register<typeof GetAccountTransactionsRequestSchema, GetAccountTransactionsResponse>(
  `${ApiNamespace.account}/getAccountTransactions`,
  GetAccountTransactionsRequestSchema,
  async (request, node): Promise<void> => {
    const account = getAccount(node, request.data.account)

    if (request.data.hash) {
      await handleSingleTransaction(request, node, account, request.data.hash)
      request.end()
      return
    }

    const headSequence = await node.wallet.getAccountHeadSequence(account)

    if (request.data.limit) {
      await handleLimitedTransactions(request, node, account, request.data.limit, headSequence)
    } else {
      await handleAllTransactions(request, node, account, headSequence)
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
  },
): Promise<void> => {
  const serializedTransaction = serializeRpcAccountTransaction(transaction)

  let creator = false
  for (const spend of transaction.transaction.spends()) {
    const noteHash = await account.getNoteHash(spend.nullifier)

    if (noteHash) {
      creator = true
      break
    }
  }

  const status = await node.wallet.getTransactionStatus(account, transaction, options)

  const serialized = {
    ...serializedTransaction,
    creator,
    status,
  }

  request.stream(serialized)
}

const handleSingleTransaction = async (
  request: RpcRequest<GetAccountTransactionsRequest, GetAccountTransactionsResponse>,
  node: IronfishNode,
  account: Account,
  hash: string,
): Promise<void> => {
  const hashBuffer = Buffer.from(hash, 'hex')

  const transaction = await account.getTransactionByUnsignedHash(hashBuffer)

  if (transaction) {
    await streamTransaction(request, node, account, transaction)
  }
}

const handleLimitedTransactions = async (
  request: RpcRequest<GetAccountTransactionsRequest, GetAccountTransactionsResponse>,
  node: IronfishNode,
  account: Account,
  limit: number,
  headSequence?: number | null,
): Promise<void> => {
  const queue = new FastPriorityQueue<TransactionValue>(function (a, b) {
    if (a.sequence && b.sequence) {
      // both a and b are mined on chain, use sequence as sort key
      return a.sequence < b.sequence
    } else {
      // at least one is in pending status, use expirationSequence as sort key
      if (a.transaction.expirationSequence() && b.transaction.expirationSequence()) {
        return a.transaction.expirationSequence() < b.transaction.expirationSequence()
      } else {
        // transactions without expiration are always latest
        return b.transaction.expirationSequence() === 0
      }
    }
  })

  for await (const transaction of account.getTransactions()) {
    Assert.isNotNull(transaction)
    queue.add(transaction)
    // remove the earliest transaction when queue is full
    if (queue.size > limit) {
      queue.poll()
    }
  }
  while (!queue.isEmpty()) {
    if (request.closed) {
      break
    }

    const transaction = queue.poll()
    Assert.isNotUndefined(transaction)
    await streamTransaction(request, node, account, transaction, { headSequence })
  }
}

const handleAllTransactions = async (
  request: RpcRequest<GetAccountTransactionsRequest, GetAccountTransactionsResponse>,
  node: IronfishNode,
  account: Account,
  headSequence?: number | null,
): Promise<void> => {
  for await (const transaction of account.getTransactions()) {
    if (request.closed) {
      break
    }
    await streamTransaction(request, node, account, transaction, { headSequence })
  }
}
