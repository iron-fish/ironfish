/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { RPC_ERROR_CODES, RpcValidationError } from '../../adapters'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
/**
 * Our endpoints follow the verbObject naming convention, where the verb is the
 * HTTP verb and the object is the object being acted upon. For example,
 * `POST /wallet/burnAsset` burns an asset.
 *
 * However, there is a `POST /wallet/create` endpoint that creates a wallet which does
 * not follow this rule.
 *
 * Hence, we're adding a new createAccount endpoint and will eventually sunset the create endpoint.
 */

export type CreateAccountRequest = { name: string; default?: boolean }
export type CreateAccountResponse = {
  name: string
  publicAddress: string
  isDefaultAccount: boolean
}

export const CreateAccountRequestSchema: yup.ObjectSchema<CreateAccountRequest> = yup
  .object({
    name: yup.string().defined(),
    default: yup.boolean().optional(),
  })
  .defined()

export const CreateAccountResponseSchema: yup.ObjectSchema<CreateAccountResponse> = yup
  .object({
    name: yup.string().defined(),
    publicAddress: yup.string().defined(),
    isDefaultAccount: yup.boolean().defined(),
  })
  .defined()

routes.register<typeof CreateAccountRequestSchema, CreateAccountResponse>(
  `${ApiNamespace.wallet}/createAccount`,
  CreateAccountRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet')

    const name = request.data.name

    if (context.wallet.accountExists(name)) {
      throw new RpcValidationError(
        `There is already an account with the name ${name}`,
        400,
        RPC_ERROR_CODES.ACCOUNT_EXISTS,
      )
    }

    const account = await context.wallet.createAccount(name)
    if (context.wallet.nodeClient) {
      void context.wallet.scanTransactions()
    }

    let isDefaultAccount = false
    if (!context.wallet.hasDefaultAccount || request.data.default) {
      await context.wallet.setDefaultAccount(name)
      isDefaultAccount = true
    }

    request.end({
      name: account.name,
      publicAddress: account.publicAddress,
      isDefaultAccount,
    })
  },
)
