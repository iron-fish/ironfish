/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ERROR_CODES, ValidationError } from '../../adapters'
import { ApiNamespace, router } from '../router'

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

router.register<typeof CreateAccountRequestSchema, CreateAccountResponse>(
  `${ApiNamespace.account}/create`,
  CreateAccountRequestSchema,
  async (request, node): Promise<void> => {
    const name = request.data.name

    if (node.accounts.accountExists(name)) {
      throw new ValidationError(
        `There is already an account with the name ${name}`,
        400,
        ERROR_CODES.ACCOUNT_EXISTS,
      )
    }

    const account = await node.accounts.createAccount(name)

    let isDefaultAccount = false
    if (!node.accounts.hasDefaultAccount || request.data.default) {
      await node.accounts.setDefaultAccount(name)
      isDefaultAccount = true
    }

    request.end({
      name: account.name,
      publicAddress: account.publicAddress,
      isDefaultAccount,
    })
  },
)
