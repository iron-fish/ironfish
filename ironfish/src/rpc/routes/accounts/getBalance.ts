/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'
import { getAccount } from './utils'

export type GetBalanceRequest = { account?: string }
export type GetBalanceResponse = { account: string; confirmed: string; unconfirmed: string }

export const GetBalanceRequestSchema: yup.ObjectSchema<GetBalanceRequest> = yup
  .object({
    account: yup.string().strip(true),
  })
  .defined()

export const GetBalanceResponseSchema: yup.ObjectSchema<GetBalanceResponse> = yup
  .object({
    account: yup.string().defined(),
    unconfirmed: yup.string().defined(),
    confirmed: yup.string().defined(),
  })
  .defined()

router.register<typeof GetBalanceRequestSchema, GetBalanceResponse>(
  `${ApiNamespace.account}/getBalance`,
  GetBalanceRequestSchema,
  async (request, node): Promise<void> => {
    const account = getAccount(node, request.data.account)
    const { confirmed, unconfirmed } = await node.accounts.getBalance(account)

    request.end({
      account: account.displayName,
      confirmed: confirmed.toString(),
      unconfirmed: unconfirmed.toString(),
    })
  },
)
