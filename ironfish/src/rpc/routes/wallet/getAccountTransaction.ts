/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { RpcWalletTransaction, RpcWalletTransactionSchema } from '../wallet/types'
import { serializeRpcWalletTransaction } from './serializers'
import { getAccount, getAccountDecryptedNotes } from './utils'

export type GetAccountTransactionRequest = {
  hash: string
  account?: string
  serialized?: boolean
  confirmations?: number
  notes?: boolean
  spends?: boolean
}

export type GetAccountTransactionResponse = {
  account: string
  transaction: RpcWalletTransaction | null
}

export const GetAccountTransactionRequestSchema: yup.ObjectSchema<GetAccountTransactionRequest> =
  yup
    .object({
      account: yup.string(),
      hash: yup.string().defined(),
      confirmations: yup.string(),
      serialized: yup.boolean().notRequired().default(false),
      notes: yup.boolean().notRequired().default(true),
      spends: yup.boolean().notRequired().default(true),
    })
    .defined()

export const GetAccountTransactionResponseSchema: yup.ObjectSchema<GetAccountTransactionResponse> =
  yup
    .object({
      account: yup.string().defined(),
      transaction: RpcWalletTransactionSchema.defined().nullable(),
    })
    .defined()

routes.register<typeof GetAccountTransactionRequestSchema, GetAccountTransactionResponse>(
  `${ApiNamespace.wallet}/getAccountTransaction`,
  GetAccountTransactionRequestSchema,
  async (request, node): Promise<void> => {
    AssertHasRpcContext(request, node, 'wallet', 'config', 'workerPool')

    const account = getAccount(node.wallet, request.data.account)

    const transactionHash = Buffer.from(request.data.hash, 'hex')

    const transaction = await account.getTransaction(transactionHash)

    if (!transaction) {
      return request.end({
        account: account.name,
        transaction: null,
      })
    }

    const serializedTransaction = await serializeRpcWalletTransaction(
      node.config,
      node.wallet,
      account,
      transaction,
      {
        confirmations: request.data.confirmations,
        serialized: request.data.serialized,
      },
    )

    const notes = request.data.notes
      ? await getAccountDecryptedNotes(node.workerPool, account, transaction)
      : undefined

    const spends = request.data.spends
      ? transaction.transaction.spends.map((spend) => ({
          nullifier: spend.nullifier.toString('hex'),
          commitment: spend.commitment.toString('hex'),
          size: spend.size,
        }))
      : undefined

    const serialized = {
      ...serializedTransaction,
      notes,
      spends,
    }

    request.end({
      account: account.name,
      transaction: serialized,
    })
  },
)
