/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { RPC_ERROR_CODES, RpcValidationError } from '../../adapters/errors'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'

export type DecryptWalletRequest = { passphrase: string }
export type DecryptWalletResponse = undefined

export const DecryptWalletRequestSchema: yup.ObjectSchema<DecryptWalletRequest> = yup
  .object({
    passphrase: yup.string().defined(),
  })
  .defined()

export const DecryptWalletResponseSchema: yup.MixedSchema<DecryptWalletResponse> = yup
  .mixed()
  .oneOf([undefined] as const)

routes.register<typeof DecryptWalletRequestSchema, DecryptWalletResponse>(
  `${ApiNamespace.wallet}/decrypt`,
  DecryptWalletRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet')

    const encrypted = await context.wallet.accountsEncrypted()
    if (!encrypted) {
      throw new RpcValidationError(
        'Wallet is already decrypted',
        400,
        RPC_ERROR_CODES.WALLET_ALREADY_DECRYPTED,
      )
    }

    await context.wallet.decrypt(request.data.passphrase)
    request.end()
  },
)
