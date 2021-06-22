/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'
import { getAccount } from './utils'

export type GetBalanceRequest = { account?: string }
export type GetBalanceResponse = { confirmedBalance: string; unconfirmedBalance: string }

export const GetBalanceRequestSchema: yup.ObjectSchema<GetBalanceRequest> = yup
  .object({
    account: yup.string().strip(true),
  })
  .defined()

export const GetBalanceResponseSchema: yup.ObjectSchema<GetBalanceResponse> = yup
  .object({
    unconfirmedBalance: yup.string().defined(),
    confirmedBalance: yup.string().defined(),
  })
  .defined()

router.register<typeof GetBalanceRequestSchema, GetBalanceResponse>(
  `${ApiNamespace.account}/getBalance`,
  GetBalanceRequestSchema,
  (request, node): void => {
    const account = getAccount(node, request.data.account)
    const { confirmedBalance, unconfirmedBalance } = node.accounts.getBalance(account)
    request.end({
      confirmedBalance: confirmedBalance.toString(),
      unconfirmedBalance: unconfirmedBalance.toString(),
    })
  },
)
