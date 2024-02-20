/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'
import { RawTransactionSerde } from '../../../primitives'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { getAccount } from './utils'

export type BuildTransactionRequest = {
  account?: string
  rawTransaction: string
}

export type BuildTransactionResponse = {
  unsignedTransaction: string
}

export const BuildTransactionRequestSchema: yup.ObjectSchema<BuildTransactionRequest> = yup
  .object({
    account: yup.string().optional(),
    rawTransaction: yup.string().defined(),
  })
  .defined()

export const BuildTransactionResponseSchema: yup.ObjectSchema<BuildTransactionResponse> = yup
  .object({
    unsignedTransaction: yup.string().defined(),
  })
  .defined()

routes.register<typeof BuildTransactionRequestSchema, BuildTransactionResponse>(
  `${ApiNamespace.wallet}/buildTransaction`,
  BuildTransactionRequestSchema,
  async (request, node): Promise<void> => {
    AssertHasRpcContext(request, node, 'wallet')
    AssertHasRpcContext(request, node, 'workerPool')

    const account = getAccount(node.wallet, request.data.account)

    const raw = RawTransactionSerde.deserialize(Buffer.from(request.data.rawTransaction, 'hex'))

    const unsigned = await node.wallet.build({ transaction: raw, account })

    request.end({
      unsignedTransaction: unsigned.transaction.serialize().toString('hex'),
    })
  },
)
