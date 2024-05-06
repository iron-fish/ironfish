/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { getAccount } from './utils'

export type StartSyncingRequest = { account: string }
export type StartSyncingResponse = undefined

export const StartSyncingRequestSchema: yup.ObjectSchema<StartSyncingRequest> = yup
  .object({
    account: yup.string().defined(),
  })
  .defined()

export const StartSyncingResponseSchema: yup.MixedSchema<StartSyncingResponse> = yup
  .mixed()
  .oneOf([undefined] as const)

routes.register<typeof StartSyncingRequestSchema, StartSyncingResponse>(
  `${ApiNamespace.wallet}/startSyncing`,
  StartSyncingRequestSchema,
  (request, context): void => {
    AssertHasRpcContext(request, context, 'wallet')

    const account = getAccount(context.wallet, request.data.account)
    account.updateSyncingEnabled(true)
    request.end()
  },
)
