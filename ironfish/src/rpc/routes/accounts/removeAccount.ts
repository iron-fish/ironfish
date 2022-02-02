/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ValidationError } from '../../adapters'
import { ApiNamespace, router } from '../router'

export type RemoveAccountRequest = { name: string; confirm?: boolean }
export type RemoveAccountResponse = { needsConfirm?: boolean }

export const RemoveAccountRequestSchema: yup.ObjectSchema<RemoveAccountRequest> = yup
  .object({
    name: yup.string().defined(),
    confirm: yup.boolean().optional(),
  })
  .defined()

export const RemoveAccountResponseSchema: yup.ObjectSchema<RemoveAccountResponse> = yup
  .object({
    needsConfirm: yup.boolean().optional(),
  })
  .defined()

router.register<typeof RemoveAccountRequestSchema, RemoveAccountResponse>(
  `${ApiNamespace.account}/remove`,
  RemoveAccountRequestSchema,
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

    if (!request.data.confirm) {
      const balance = await node.accounts.getBalance(account)

      if (balance.unconfirmed !== BigInt(0)) {
        request.end({ needsConfirm: true })
        return
      }
    }

    await node.accounts.removeAccount(account.name)
    request.end({})
  },
)
