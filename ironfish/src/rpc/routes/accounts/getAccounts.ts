/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Account } from '../../../account'
import { ApiNamespace, router } from '../router'

// eslint-disable-next-line @typescript-eslint/ban-types
export type GetAccountsRequest = { default?: boolean; displayName?: boolean } | undefined
export type GetAccountsResponse = { accounts: string[] }

export const GetAccountsRequestSchema: yup.ObjectSchema<GetAccountsRequest> = yup
  .object({
    default: yup.boolean().optional(),
  })
  .notRequired()
  .default({})

export const GetAccountsResponseSchema: yup.ObjectSchema<GetAccountsResponse> = yup
  .object({
    accounts: yup.array(yup.string().defined()).defined(),
  })
  .defined()

router.register<typeof GetAccountsRequestSchema, GetAccountsResponse>(
  `${ApiNamespace.account}/getAccounts`,
  GetAccountsRequestSchema,
  (request, node): void => {
    let accounts: Account[] = []

    if (request.data?.default) {
      const defaultAccount = node.accounts.getDefaultAccount()
      if (defaultAccount) {
        accounts = [defaultAccount]
      }
    } else {
      accounts = node.accounts.listAccounts()
    }

    const names = accounts.map((a) => (request.data?.displayName ? a.displayName : a.name))
    request.end({ accounts: names })
  },
)
