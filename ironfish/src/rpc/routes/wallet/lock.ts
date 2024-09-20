/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'

export type LockWalletRequest = undefined
export type LockWalletResponse = undefined

export const LockWalletRequestSchema: yup.MixedSchema<LockWalletRequest> = yup
  .mixed()
  .oneOf([undefined] as const)

export const LockWalletResponseSchema: yup.MixedSchema<LockWalletResponse> = yup
  .mixed()
  .oneOf([undefined] as const)

routes.register<typeof LockWalletRequestSchema, LockWalletResponse>(
  `${ApiNamespace.wallet}/lock`,
  LockWalletRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet')
    await context.wallet.lock()
    request.end()
  },
)
