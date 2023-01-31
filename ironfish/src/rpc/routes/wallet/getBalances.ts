/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'
import { getAccount } from './utils'

export interface GetBalancesRequest {
  account?: string
  confirmations?: number
}

export interface GetBalancesResponse {
  account: string
  balances: {
    assetId: string
    confirmed: string
    unconfirmed: string
    unconfirmedCount: number
    pending: string
    pendingCount: number
    available: string
    blockHash: string | null
    sequence: number | null
  }[]
}

export const GetBalancesRequestSchema: yup.ObjectSchema<GetBalancesRequest> = yup
  .object({
    account: yup.string().optional(),
    confirmations: yup.number().min(0).optional(),
  })
  .defined()

export const GetBalancesResponseSchema: yup.ObjectSchema<GetBalancesResponse> = yup
  .object({
    account: yup.string().defined(),
    balances: yup
      .array()
      .of(
        yup
          .object()
          .shape({
            assetId: yup.string().defined(),
            unconfirmed: yup.string().defined(),
            unconfirmedCount: yup.number().defined(),
            pending: yup.string().defined(),
            pendingCount: yup.number().defined(),
            confirmed: yup.string().defined(),
            available: yup.string().defined(),
            blockHash: yup.string().nullable(true).defined(),
            sequence: yup.number().nullable(true).defined(),
          })
          .defined(),
      )
      .defined(),
  })
  .defined()

router.register<typeof GetBalancesRequestSchema, GetBalancesResponse>(
  `${ApiNamespace.wallet}/getBalances`,
  GetBalancesRequestSchema,
  async (request, node): Promise<void> => {
    const account = getAccount(node, request.data.account)

    const balances = []
    for await (const {
      assetId,
      blockHash,
      confirmed,
      sequence,
      unconfirmed,
      unconfirmedCount,
      pending,
      pendingCount,
      available,
    } of node.wallet.getBalances(account, request.data.confirmations)) {
      if (request.closed) {
        return
      }

      balances.push({
        assetId: assetId.toString('hex'),
        blockHash: blockHash ? blockHash.toString('hex') : null,
        confirmed: confirmed.toString(),
        sequence,
        unconfirmed: unconfirmed.toString(),
        unconfirmedCount,
        pending: pending.toString(),
        pendingCount,
        available: available.toString(),
      })
    }

    request.end({ account: account.name, balances })
  },
)
