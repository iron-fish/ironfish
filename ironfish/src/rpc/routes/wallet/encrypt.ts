/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'

export type EncryptWalletRequest = { passphrase: string }
export type EncryptWalletResponse = {}

export const EncryptWalletRequestSchema: yup.ObjectSchema<EncryptWalletRequest> = yup
  .object({
    passphrase: yup.string().defined(),
  })
  .defined()

export const EncryptWalletResponseSchema: yup.ObjectSchema<EncryptWalletResponse> = yup
  .object({})
  .defined()

routes.register<typeof EncryptWalletRequestSchema, EncryptWalletResponse>(
  `${ApiNamespace.wallet}/encrypt`,
  EncryptWalletRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet')

    await context.wallet.encrypt(request.data.passphrase)
    request.end({})
  },
)
