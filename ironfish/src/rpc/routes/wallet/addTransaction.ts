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
  account: string
}

export const AddTransactionRequestSchema: yup.ObjectSchema<AddTransactionRequest> = yup
  .object({
    transaction: yup.string().defined(),
    broadcast: yup.boolean().optional().default(true),
  })
  .defined()

export const AddTransactionResponseSchema: yup.ObjectSchema<AddTransactionResponse> = yup
  .object({
    account: yup.string().defined(),
  })
  .defined()

router.register<typeof AddTransactionRequestSchema, AddTransactionResponse>(
  `${ApiNamespace.wallet}/addTransaction`,
  AddTransactionRequestSchema,
  async (request, node): Promise<void> => {
    const data = Buffer.from(request.data.transaction, 'hex')
    const transaction = new Transaction(data)

    const verify = node.chain.verifier.verifyCreatedTransaction(transaction)
    if (!verify.valid) {
      throw new ValidationError(`Invalid transaction, reason: ${String(verify.reason)}`, 400)
    }

    await node.wallet.addPendingTransaction(transaction)

    const account = await AsyncUtils.find(node.wallet.listAccounts(), (account) =>
      account.hasTransaction(transaction.hash()),
    )

    if (!account) {
      throw new ValidationError(
        `Transaction ${transaction.hash().toString('hex')} is not related to any account`,
      )
    }

    node.memPool.acceptTransaction(transaction)

    if (request.data.broadcast) {
      node.wallet.broadcastTransaction(transaction)
    }

    node.wallet.onTransactionCreated.emit(transaction)

    request.end({
      account: account.name,
    })
  },
)
