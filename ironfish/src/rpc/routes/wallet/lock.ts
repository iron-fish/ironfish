/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'

export type LockWalletRequest = {}

export type LockWalletResponse = undefined

export const LockWalletRequestSchema: yup.ObjectSchema<LockWalletRequest> = yup
  .object({})
  .defined()

export const LockWalletResponseSchema: yup.MixedSchema<LockWalletResponse> = yup
  .mixed()
  .oneOf([undefined] as const)

routes.register<typeof LockWalletRequestSchema, LockWalletResponse>(
  `${ApiNamespace.wallet}/lock`,
  LockWalletRequestSchema,
  (request, context): void => {
    AssertHasRpcContext(request, context, 'wallet')
    context.wallet.lock()
    request.end()
  },
)
