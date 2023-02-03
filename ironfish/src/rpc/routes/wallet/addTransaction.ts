/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Transaction } from '../../../primitives'
import { AsyncUtils } from '../../../utils'
import { ValidationError } from '../../adapters'
import { ApiNamespace, router } from '../router'

export type AddTransactionRequest = {
  transaction: string
  broadcast?: boolean
}

export type AddTransactionResponse = {
  accounts: string[]
}

export const AddTransactionRequestSchema: yup.ObjectSchema<AddTransactionRequest> = yup
  .object({
    transaction: yup.string().defined(),
    broadcast: yup.boolean().optional(),
  })
  .defined()

export const AddTransactionResponseSchema: yup.ObjectSchema<AddTransactionResponse> = yup
  .object({
    accounts: yup.array(yup.string().defined()).defined(),
  })
  .defined()

router.register<typeof AddTransactionRequestSchema, AddTransactionResponse>(
  `${ApiNamespace.wallet}/addTransaction`,
  AddTransactionRequestSchema,
  async (request, node): Promise<void> => {
    if (request.data.broadcast == null) {
      request.data.broadcast = true
    }

    const data = Buffer.from(request.data.transaction, 'hex')
    const transaction = new Transaction(data)

    const verify = node.chain.verifier.verifyCreatedTransaction(transaction)
    if (!verify.valid) {
      throw new ValidationError(`Invalid transaction, reason: ${String(verify.reason)}`, 400)
    }

    await node.wallet.addPendingTransaction(transaction)

    const accounts = await AsyncUtils.filter(node.wallet.listAccounts(), (account) =>
      account.hasTransaction(transaction.hash()),
    )

    if (accounts.length === 0) {
      throw new ValidationError(
        `Transaction ${transaction.hash().toString('hex')} is not related to any account`,
      )
    }

    node.memPool.acceptTransaction(transaction)

    if (request.data.broadcast) {
      node.wallet.broadcastTransaction(transaction)
    }

    request.end({
      accounts: accounts.map((a) => a.name),
    })
  },
)
