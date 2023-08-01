/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { IronfishNode } from '../../../node'
import { Transaction } from '../../../primitives'
import { ApiNamespace, routes } from '../router'

export type AcceptTransactionRequest = {
  transaction: string
}

export type AcceptTransactionResponse = {
  accepted: boolean
  reason?: string
}

export const AcceptTransactionRequestSchema: yup.ObjectSchema<AcceptTransactionRequest> = yup
  .object({
    transaction: yup.string().defined(),
  })
  .defined()

export const AcceptTransactionResponseSchema: yup.ObjectSchema<AcceptTransactionResponse> = yup
  .object({
    accepted: yup.boolean().defined(),
    reason: yup.string().optional(),
  })
  .defined()

routes.register<typeof AcceptTransactionRequestSchema, AcceptTransactionResponse>(
  `${ApiNamespace.mempool}/acceptTransaction`,
  AcceptTransactionRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, IronfishNode)

    const data = Buffer.from(request.data.transaction, 'hex')
    const transaction = new Transaction(data)

    const verify = await node.chain.verifier.verifyNewTransaction(transaction)
    if (!verify.valid) {
      request.end({
        accepted: false,
        reason: String(verify.reason),
      })
      return
    }

    const accepted = node.memPool.acceptTransaction(transaction)
    request.end({
      accepted,
    })
  },
)
