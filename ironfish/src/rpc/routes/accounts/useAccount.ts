/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ValidationError } from '../../adapters'
import { ApiNamespace, router } from '../router'

export type UseAccountRequest = { name: string }
export type UseAccountResponse = undefined

export const UseAccountRequestSchema: yup.ObjectSchema<UseAccountRequest> = yup
  .object({
    name: yup.string().defined(),
  })
  .defined()

export const UseAccountResponseSchema: yup.MixedSchema<UseAccountResponse> = yup
  .mixed()
  .oneOf([undefined] as const)

router.register<typeof UseAccountRequestSchema, UseAccountResponse>(
  `${ApiNamespace.account}/use`,
  UseAccountRequestSchema,
  async (request, node): Promise<void> => {
    const name = request.data.name
    const account = node.accounts.getAccountByName(name)

    if (!account) {
      throw new ValidationError(
        `There is no account with the name ${name}. Options are:\n` +
          node.accounts
            .listAccounts()
            .map((a) => a.name)
            .join('\n'),
      )
    }

    await node.accounts.setDefaultAccount(account.name)
    request.end()
  },
)
