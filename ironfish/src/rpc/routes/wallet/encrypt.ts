/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { RPC_ERROR_CODES, RpcValidationError } from '../../adapters/errors'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'

export type EncryptWalletRequest = { passphrase: string }
export type EncryptWalletResponse = undefined

export const EncryptWalletRequestSchema: yup.ObjectSchema<EncryptWalletRequest> = yup
  .object({
    passphrase: yup.string().defined(),
  })
  .defined()

export const EncryptWalletResponseSchema: yup.MixedSchema<EncryptWalletResponse> = yup
  .mixed()
  .oneOf([undefined] as const)

routes.register<typeof EncryptWalletRequestSchema, EncryptWalletResponse>(
  `${ApiNamespace.wallet}/encrypt`,
  EncryptWalletRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet')

    const encrypted = await context.wallet.accountsEncrypted()
    if (encrypted) {
      throw new RpcValidationError(
        'Wallet is already encrypted',
        400,
        RPC_ERROR_CODES.WALLET_ALREADY_ENCRYPTED,
      )
    }

    await context.wallet.encrypt(request.data.passphrase)
    request.end()
  },
)
