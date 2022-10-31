/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'
import { getAccount } from './utils'

export type GetBalanceRequest = { account?: string; minimumBlockConfirmations?: number }

export type GetBalanceResponse = {
  account: string
  confirmed: string
  pending: string
  pendingCount: number
  unconfirmed: string
  unconfirmedCount: number
  minimumBlockConfirmations: number
}

export const GetBalanceRequestSchema: yup.ObjectSchema<GetBalanceRequest> = yup
  .object({
    account: yup.string().strip(true),
  })
  .defined()

export const GetBalanceResponseSchema: yup.ObjectSchema<GetBalanceResponse> = yup
  .object({
    account: yup.string().defined(),
    unconfirmed: yup.string().defined(),
    unconfirmedCount: yup.number().defined(),
    pending: yup.string().defined(),
    pendingCount: yup.number().defined(),
    confirmed: yup.string().defined(),
    minimumBlockConfirmations: yup.number().defined(),
  })
  .defined()

router.register<typeof GetBalanceRequestSchema, GetBalanceResponse>(
  `${ApiNamespace.account}/getBalance`,
  GetBalanceRequestSchema,
  async (request, node): Promise<void> => {
    const minimumBlockConfirmations = Math.max(
      request.data.minimumBlockConfirmations ?? node.config.get('minimumBlockConfirmations'),
      0,
    )

    const account = getAccount(node, request.data.account)
    const balance = await node.wallet.getBalance(account, { minimumBlockConfirmations })

    request.end({
      account: account.name,
      confirmed: balance.confirmed.toString(),
      pending: balance.pending.toString(),
      pendingCount: balance.pendingCount,
      unconfirmed: balance.unconfirmed.toString(),
      unconfirmedCount: balance.unconfirmedCount,
      minimumBlockConfirmations,
    })
  },
)
