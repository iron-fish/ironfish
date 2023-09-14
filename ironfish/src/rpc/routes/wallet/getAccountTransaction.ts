/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { RpcSpend, RpcSpendSchema } from '../chain'
import { ApiNamespace, routes } from '../router'
import { RpcWalletTransaction, RpcWalletTransactionSchema } from '../wallet/types'
import { RpcWalletNote, RpcWalletNoteSchema } from './types'
import { getAccount, getAccountDecryptedNotes, serializeRpcAccountTransaction } from './utils'

export type GetAccountTransactionRequest = {
  hash: string
  account?: string
  confirmations?: number
}

export type GetAccountTransactionResponse = {
  account: string
  transaction:
    | (RpcWalletTransaction & {
        notes: RpcWalletNote[]
        spends: RpcSpend[]
      })
    | null
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
      transaction: RpcWalletTransactionSchema.concat(
        yup
          .object({
            notes: yup.array(RpcWalletNoteSchema).defined(),
            spends: yup.array(RpcSpendSchema).defined(),
          })
          .defined(),
      ),
    })
    .defined()

routes.register<typeof GetAccountTransactionRequestSchema, GetAccountTransactionResponse>(
  `${ApiNamespace.wallet}/getAccountTransaction`,
  GetAccountTransactionRequestSchema,
  async (request, node): Promise<void> => {
    const account = getAccount(node.wallet, request.data.account)

    const transactionHash = Buffer.from(request.data.hash, 'hex')

    const transaction = await account.getTransaction(transactionHash)

    if (!transaction) {
      return request.end({
        account: account.name,
        transaction: null,
      })
    }

    const serializedTransaction = await serializeRpcAccountTransaction(
      node,
      account,
      transaction,
      request.data.confirmations,
    )

    const notes = await getAccountDecryptedNotes(node.workerPool, account, transaction)

    const spends = transaction.transaction.spends.map((spend) => ({
      nullifier: spend.nullifier.toString('hex'),
      commitment: spend.commitment.toString('hex'),
      size: spend.size,
    }))

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
