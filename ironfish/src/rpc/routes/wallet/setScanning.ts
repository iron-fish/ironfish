/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { getAccount } from './utils'

export type SetScanningRequest = { account: string; enabled: boolean }
export type SetScanningResponse = undefined

export const SetScanningRequestSchema: yup.ObjectSchema<SetScanningRequest> = yup
  .object({
    account: yup.string().defined(),
    enabled: yup.boolean().defined(),
  })
  .defined()

export const SetScanningResponseSchema: yup.MixedSchema<SetScanningResponse> = yup
  .mixed()
  .oneOf([undefined] as const)

routes.register<typeof SetScanningRequestSchema, SetScanningResponse>(
  `${ApiNamespace.wallet}/setScanning`,
  SetScanningRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet')

    const account = getAccount(context.wallet, request.data.account)
    await context.wallet.setScanningEnabled(account, request.data.enabled)
    request.end()
  },
)
