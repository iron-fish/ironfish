/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { getAccount } from './utils'

export type StopScanningRequest = { account: string }
export type StopScanningResponse = undefined

export const StopScanningRequestSchema: yup.ObjectSchema<StopScanningRequest> = yup
  .object({
    account: yup.string().defined(),
  })
  .defined()

export const StopScanningResponseSchema: yup.MixedSchema<StopScanningResponse> = yup
  .mixed()
  .oneOf([undefined] as const)

routes.register<typeof StopScanningRequestSchema, StopScanningResponse>(
  `${ApiNamespace.wallet}/stopScanning`,
  StopScanningRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet')

    const account = getAccount(context.wallet, request.data.account)
    await account.updateScanningEnabled(false)
    request.end()
  },
)
