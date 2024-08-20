/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { serializeRpcAccountStatus } from './serializers'
import { RpcAccountStatus, RpcAccountStatusSchema } from './types'

export type GetAccountsStatusRequest = Record<string, never> | undefined

export type GetAccountsStatusResponse = {
  accounts: RpcAccountStatus[]
  encrypted: boolean
  locked: boolean
}

export const GetAccountsStatusRequestSchema: yup.ObjectSchema<GetAccountsStatusRequest> = yup
  .object<Record<string, never>>({})
  .notRequired()
  .default({})

export const GetAccountsStatusResponseSchema: yup.ObjectSchema<GetAccountsStatusResponse> = yup
  .object({
    accounts: yup.array(RpcAccountStatusSchema).defined(),
    encrypted: yup.boolean().defined(),
    locked: yup.boolean().defined(),
  })
  .defined()

routes.register<typeof GetAccountsStatusRequestSchema, GetAccountsStatusResponse>(
  `${ApiNamespace.wallet}/getAccountsStatus`,
  GetAccountsStatusRequestSchema,
  async (request, node): Promise<void> => {
    AssertHasRpcContext(request, node, 'wallet')

    const accounts = await Promise.all(
      node.wallet.accounts.map((account) => serializeRpcAccountStatus(node.wallet, account)),
    )

    request.end({
      accounts,
      encrypted: await node.wallet.accountsEncrypted(),
      locked: node.wallet.locked,
    })
  },
)
