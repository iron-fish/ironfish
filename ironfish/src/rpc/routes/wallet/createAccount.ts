/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ERROR_CODES, ValidationError } from '../../adapters'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
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
  async (request, node): Promise<void> => {
    const name = request.data.name

    if (node.wallet.accountExists(name)) {
      throw new ValidationError(
        `There is already an account with the name ${name}`,
        400,
        ERROR_CODES.ACCOUNT_EXISTS,
      )
    }

    const account = await node.wallet.createAccount(name)
    if (node.wallet.nodeClient) {
      void node.wallet.scanTransactions()
    }

    let isDefaultAccount = false
    if (!node.wallet.hasDefaultAccount || request.data.default) {
      await node.wallet.setDefaultAccount(name)
      isDefaultAccount = true
    }

    request.end({
      name: account.name,
      publicAddress: account.publicAddress,
      isDefaultAccount,
    })
  },
)
