/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { RpcAccountStatus, RpcAccountStatusSchema } from './types'
import { serializeRpcAccountStatus } from './utils'

export type GetAccountsStatusRequest = Record<string, never> | undefined

export type GetAccountsStatusResponse = {
  accounts: RpcAccountStatus[]
}

export const GetAccountsStatusRequestSchema: yup.ObjectSchema<GetAccountsStatusRequest> = yup
  .object<Record<string, never>>({})
  .notRequired()
  .default({})

export const GetAccountsStatusResponseSchema: yup.ObjectSchema<GetAccountsStatusResponse> = yup
  .object({
    accounts: yup.array(RpcAccountStatusSchema).defined(),
  })
  .defined()

routes.register<typeof GetAccountsStatusRequestSchema, GetAccountsStatusResponse>(
  `${ApiNamespace.wallet}/getAccountsStatus`,
  GetAccountsStatusRequestSchema,
  async (request, node): Promise<void> => {
    AssertHasRpcContext(request, node, 'wallet')

    const accounts = await Promise.all(
      node.wallet
        .listAccounts()
        .map((account) => serializeRpcAccountStatus(node.wallet, account)),
    )

    request.end({ accounts })
  },
)
