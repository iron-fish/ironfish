/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'

export type DecryptWalletRequest = { passphrase: string }
export type DecryptWalletResponse = {}

export const DecryptWalletRequestSchema: yup.ObjectSchema<DecryptWalletRequest> = yup
  .object({
    passphrase: yup.string().defined(),
  })
  .defined()

export const DecryptWalletResponseSchema: yup.ObjectSchema<DecryptWalletResponse> = yup
  .object({})
  .defined()

routes.register<typeof DecryptWalletRequestSchema, DecryptWalletResponse>(
  `${ApiNamespace.wallet}/decrypt`,
  DecryptWalletRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet')

    await context.wallet.decrypt(request.data.passphrase)
    request.end({})
  },
)
