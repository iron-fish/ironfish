/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { RPC_ERROR_CODES, RpcValidationError } from '../../adapters/errors'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'

export type UnlockWalletRequest = { passphrase: string; timeout?: number }
export type UnlockWalletResponse = undefined

export const UnlockWalletRequestSchema: yup.ObjectSchema<UnlockWalletRequest> = yup
  .object({
    passphrase: yup.string().defined(),
    timeout: yup.number().optional(),
  })
  .defined()

export const UnlockWalletResponseSchema: yup.MixedSchema<UnlockWalletResponse> = yup
  .mixed()
  .oneOf([undefined] as const)

routes.register<typeof UnlockWalletRequestSchema, UnlockWalletResponse>(
  `${ApiNamespace.wallet}/unlock`,
  UnlockWalletRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet')

    if (request.data.timeout && request.data.timeout < -1) {
      throw new RpcValidationError(
        `Invalid timeout value: ${request.data.timeout}`,
        400,
        RPC_ERROR_CODES.VALIDATION,
      )
    }

    await context.wallet.unlock(request.data.passphrase, request.data.timeout)
    request.end()
  },
)
