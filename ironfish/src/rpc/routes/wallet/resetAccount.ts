/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { getAccount } from './utils'

export type ResetAccountRequest = {
  account: string
  resetCreatedAt?: boolean
  resetScanningEnabled?: boolean
}
export type ResetAccountResponse = undefined

export const ResetAccountRequestSchema: yup.ObjectSchema<ResetAccountRequest> = yup
  .object({
    account: yup.string().defined(),
    resetCreatedAt: yup.boolean(),
    resetScanningEnabled: yup.boolean(),
  })
  .defined()

export const ResetAccountResponseSchema: yup.MixedSchema<ResetAccountResponse> = yup
  .mixed()
  .oneOf([undefined] as const)

routes.register<typeof ResetAccountRequestSchema, ResetAccountResponse>(
  `${ApiNamespace.wallet}/resetAccount`,
  ResetAccountRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet', 'logger')

    const account = getAccount(context.wallet, request.data.account)

    await context.wallet.resetAccount(account, {
      resetCreatedAt: request.data.resetCreatedAt,
      resetScanningEnabled: request.data.resetScanningEnabled,
    })

    request.end()
  },
)
