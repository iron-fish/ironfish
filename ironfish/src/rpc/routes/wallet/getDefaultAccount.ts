/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'

// eslint-disable-next-line @typescript-eslint/ban-types
export type GetDefaultAccountRequest = {} | undefined
export type GetDefaultAccountResponse = { account: { name: string } | null }

export const GetDefaultAccountRequestSchema: yup.ObjectSchema<GetDefaultAccountRequest> = yup
  .object({})
  .notRequired()
  .default({})

export const GetDefaultAccountResponseSchema: yup.ObjectSchema<GetDefaultAccountResponse> = yup
  .object({
    account: yup
      .object({
        name: yup.string().defined(),
      })
      .nullable()
      .defined(),
  })
  .defined()

routes.register<typeof GetDefaultAccountRequestSchema, GetDefaultAccountResponse>(
  `${ApiNamespace.wallet}/getDefaultAccount`,
  GetDefaultAccountRequestSchema,
  (request, node): void => {
    AssertHasRpcContext(request, node, 'wallet')
    const account = node.wallet.getDefaultAccount()
    request.end({ account: account ? { name: account.name } : null })
  },
)
