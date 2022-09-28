/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { IronfishNode } from '../../../node'
import { Account } from '../../../wallet/account'
import { TransactionValue } from '../../../wallet/walletdb/transactionValue'
import { RpcRequest } from '../../request'
import { ApiNamespace, router } from '../router'
import { serializeRpcAccountTransaction } from './types'
import { getAccount } from './utils'

export type GetAccountTransactionsRequest = { account?: string; hash?: string }

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

    const headSequence = await node.accounts.getAccountHeadSequence(account)
    const minimumBlockConfirmations = node.config.get('minimumBlockConfirmations')

    if (request.data.hash) {
      const hash = Buffer.from(request.data.hash, 'hex')
      const transaction = await account.getTransactionByUnsignedHash(hash)

      if (transaction) {
        await streamTransaction(
          request,
          account,
          transaction,
          headSequence,
          minimumBlockConfirmations,
        )
      }

      request.end()
      return
    }

    for await (const transaction of account.getTransactions()) {
      if (request.closed) {
        break
      }

      await streamTransaction(
        request,
        account,
        transaction,
        headSequence,
        minimumBlockConfirmations,
      )
    }

    request.end()
  },
)

const streamTransaction = async (
  request: RpcRequest<GetAccountTransactionsRequest, GetAccountTransactionsResponse>,
  account: Account,
  transaction: TransactionValue,
  headSequence: number | null,
  minimumBlockConfirmations: number,
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

  const status = headSequence
    ? account.getTransactionStatus(transaction, headSequence, minimumBlockConfirmations)
    : 'unknown'

  const serialized = {
    ...serializedTransaction,
    creator,
    status,
  }

  request.stream(serialized)
}
