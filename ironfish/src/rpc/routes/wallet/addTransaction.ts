/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Verifier } from '../../../consensus'
import { Transaction } from '../../../primitives'
import { AsyncUtils } from '../../../utils'
import { RpcValidationError } from '../../adapters'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'

export type AddTransactionRequest = {
  transaction: string
  broadcast?: boolean
}

export type AddTransactionResponse = {
  accounts: string[]
  hash: string
  accepted: boolean
}

export const AddTransactionRequestSchema: yup.ObjectSchema<AddTransactionRequest> = yup
  .object({
    transaction: yup.string().defined(),
    broadcast: yup.boolean().optional().default(true),
  })
  .defined()

export const AddTransactionResponseSchema: yup.ObjectSchema<AddTransactionResponse> = yup
  .object({
    accounts: yup.array(yup.string().defined()).defined(),
    hash: yup.string().defined(),
    accepted: yup.boolean().defined(),
  })
  .defined()

routes.register<typeof AddTransactionRequestSchema, AddTransactionResponse>(
  `${ApiNamespace.wallet}/addTransaction`,
  AddTransactionRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'network', 'wallet')

    const data = Buffer.from(request.data.transaction, 'hex')
    const transaction = new Transaction(data)

    const verify = Verifier.verifyCreatedTransaction(transaction, context.network.consensus)

    if (!verify.valid) {
      throw new RpcValidationError(`Invalid transaction, reason: ${String(verify.reason)}`, 400)
    }

    await context.wallet.addPendingTransaction(transaction)

    const accounts = await AsyncUtils.filter(context.wallet.accounts, (account) =>
      account.hasTransaction(transaction.hash()),
    )

    if (accounts.length === 0) {
      throw new RpcValidationError(
        `Transaction ${transaction.hash().toString('hex')} is not related to any account`,
      )
    }

    let accepted = false
    if (request.data.broadcast) {
      const result = await context.wallet.broadcastTransaction(transaction)
      accepted = result.accepted
    }

    request.end({
      accounts: accounts.map((a) => a.name),
      hash: transaction.hash().toString('hex'),
      accepted,
    })
  },
)
