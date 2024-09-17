/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { getAccount } from './utils'

export type RenameAccountRequest = { account: string; newName: string }
export type RenameAccountResponse = undefined

export const RenameAccountRequestSchema: yup.ObjectSchema<RenameAccountRequest> = yup
  .object({
    account: yup.string().defined(),
    newName: yup.string().defined(),
  })
  .defined()

export const RenameAccountResponseSchema: yup.MixedSchema<RenameAccountResponse> = yup
  .mixed()
  .oneOf([undefined] as const)

routes.register<typeof RenameAccountRequestSchema, RenameAccountResponse>(
  `${ApiNamespace.wallet}/renameAccount`,
  RenameAccountRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet')

    const account = getAccount(context.wallet, request.data.account)
    await context.wallet.setName(account, request.data.newName)
    request.end()
  },
)
