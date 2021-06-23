/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'

// eslint-disable-next-line @typescript-eslint/ban-types
export type GetDefaultAccountRequest = {} | undefined
export type GetDefaultAccountResponse = { account: { name: string } | null }

export const GetDefaultAccountRequestSchema: yup.ObjectSchema<GetDefaultAccountRequest> = yup
  .object({})
  .notRequired()
  .default({})

export const GetDefaultAccountResponseSchema: yup.ObjectSchema<GetDefaultAccountResponse> = yup
  .object({
    account: yup
      .object({
        name: yup.string().defined(),
      })
      .nullable()
      .defined(),
  })
  .defined()

router.register<typeof GetDefaultAccountRequestSchema, GetDefaultAccountResponse>(
  `${ApiNamespace.account}/getDefaultAccount`,
  GetDefaultAccountRequestSchema,
  (request, node): void => {
    const account = node.accounts.getDefaultAccount()
    request.end({ account: account ? { name: account.name } : null })
  },
)
