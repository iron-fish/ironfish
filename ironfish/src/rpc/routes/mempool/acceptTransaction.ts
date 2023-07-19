/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { Transaction } from '../../../primitives'
import { ApiNamespace, routes } from '../router'

export type AcceptTransactionRequest = {
  transaction: string
}

export type AcceptTransactionResponse = {
  accepted: boolean
}

export const AcceptTransactionRequestSchema: yup.ObjectSchema<AcceptTransactionRequest> = yup
  .object({
    transaction: yup.string().defined(),
  })
  .defined()

export const AcceptTransactionResponseSchema: yup.ObjectSchema<AcceptTransactionResponse> = yup
  .object({
    accepted: yup.boolean().defined(),
  })
  .defined()

routes.register<typeof AcceptTransactionRequestSchema, AcceptTransactionResponse>(
  `${ApiNamespace.mempool}/acceptTransaction`,
  AcceptTransactionRequestSchema,
  (request, { node }): void => {
    Assert.isNotUndefined(node)

    const data = Buffer.from(request.data.transaction, 'hex')
    const transaction = new Transaction(data)

    const accepted = node.memPool.acceptTransaction(transaction)
    request.end({
      accepted,
    })
  },
)
