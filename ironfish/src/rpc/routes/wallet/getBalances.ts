/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { CurrencyUtils } from '../../../utils'
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
    assetName: string
    confirmed: string
    unconfirmed: string
    unconfirmedCount: number
    pending: string
    pendingCount: number
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
            assetName: yup.string().defined(),
            unconfirmed: yup.string().defined(),
            unconfirmedCount: yup.number().defined(),
            pending: yup.string().defined(),
            pendingCount: yup.number().defined(),
            confirmed: yup.string().defined(),
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
    for await (const balance of node.wallet.getBalances(account, request.data.confirmations)) {
      if (request.closed) {
        return
      }

      const asset = await account.getAsset(balance.assetId)

      balances.push({
        assetId: balance.assetId.toString('hex'),
        assetName: asset?.name.toString('hex') ?? '',
        blockHash: balance.blockHash?.toString('hex') ?? null,
        confirmed: CurrencyUtils.encode(balance.confirmed),
        sequence: balance.sequence,
        unconfirmed: CurrencyUtils.encode(balance.unconfirmed),
        unconfirmedCount: balance.unconfirmedCount,
        pending: CurrencyUtils.encode(balance.pending),
        pendingCount: balance.pendingCount,
      })
    }

    request.end({ account: account.name, balances })
  },
)
