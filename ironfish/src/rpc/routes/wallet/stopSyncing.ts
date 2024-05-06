/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { getAccount } from './utils'

export type StopSyncingRequest = { account: string }
export type StopSyncingResponse = undefined

export const StopSyncingRequestSchema: yup.ObjectSchema<StopSyncingRequest> = yup
  .object({
    account: yup.string().defined(),
  })
  .defined()

export const StopSyncingResponseSchema: yup.MixedSchema<StopSyncingResponse> = yup
  .mixed()
  .oneOf([undefined] as const)

routes.register<typeof StopSyncingRequestSchema, StopSyncingResponse>(
  `${ApiNamespace.wallet}/stopSyncing`,
  StopSyncingRequestSchema,
  (request, context): void => {
    AssertHasRpcContext(request, context, 'wallet')

    const account = getAccount(context.wallet, request.data.account)
    account.updateSyncingEnabled(false)
    request.end()
  },
)
