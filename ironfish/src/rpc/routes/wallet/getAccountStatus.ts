/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { serializeRpcAccountStatus } from './serializers'
import { RpcAccountStatus, RpcAccountStatusSchema } from './types'
import { getAccount } from './utils'

export type GetAccountStatusRequest = { account: string }

export type GetAccountStatusResponse = {
  account: RpcAccountStatus
}

export const GetAccountStatusRequestSchema: yup.ObjectSchema<GetAccountStatusRequest> = yup
  .object({
    account: yup.string().defined(),
  })
  .defined()

export const GetAccountStatusResponseSchema: yup.ObjectSchema<GetAccountStatusResponse> = yup
  .object({
    account: RpcAccountStatusSchema,
  })
  .defined()

routes.register<typeof GetAccountStatusRequestSchema, GetAccountStatusResponse>(
  `${ApiNamespace.wallet}/getAccountStatus`,
  GetAccountStatusRequestSchema,
  async (request, node): Promise<void> => {
    AssertHasRpcContext(request, node, 'wallet')

    const account = getAccount(node.wallet, request.data.account)

    const accountStatus = await serializeRpcAccountStatus(node.wallet, account)

    request.end({ account: accountStatus })
  },
)
