/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'

export type DeleteTransactionRequest = {
  hash: string
}

export type DeleteTransactionResponse = {
  deleted: boolean
}

export const DeleteTransactionRequestSchema: yup.ObjectSchema<DeleteTransactionRequest> = yup
  .object({
    hash: yup.string().defined(),
  })
  .defined()
export const DeleteTransactionResponseSchema: yup.ObjectSchema<DeleteTransactionResponse> = yup
  .object({
    deleted: yup.boolean().defined(),
  })
  .defined()

routes.register<typeof DeleteTransactionRequestSchema, DeleteTransactionResponse>(
  `${ApiNamespace.wallet}/deleteTransaction`,
  DeleteTransactionRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet')

    const hash = Buffer.from(request.data.hash, 'hex')

    const deleted = await context.wallet.deleteTransaction(hash)

    request.end({
      deleted,
    })
  },
)
