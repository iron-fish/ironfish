/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'
import { getAccount } from './utils'

export type GetBalanceRequest = {
  account?: string
  assetIdentifier?: string
  minimumBlockConfirmations?: number
}

export type GetBalanceResponse = {
  account: string
  assetIdentifier: string
  confirmed: string
  unconfirmed: string
  unconfirmedCount: number
  minimumBlockConfirmations: number
}

export const GetBalanceRequestSchema: yup.ObjectSchema<GetBalanceRequest> = yup
  .object({
    account: yup.string().strip(true),
    assetIdentifier: yup.string().optional(),
  })
  .defined()

export const GetBalanceResponseSchema: yup.ObjectSchema<GetBalanceResponse> = yup
  .object({
    account: yup.string().defined(),
    assetIdentifier: yup.string().defined(),
    unconfirmed: yup.string().defined(),
    unconfirmedCount: yup.number().defined(),
    confirmed: yup.string().defined(),
    minimumBlockConfirmations: yup.number().defined(),
  })
  .defined()

router.register<typeof GetBalanceRequestSchema, GetBalanceResponse>(
  `${ApiNamespace.wallet}/getBalance`,
  GetBalanceRequestSchema,
  async (request, node): Promise<void> => {
    const minimumBlockConfirmations = Math.max(
      request.data.minimumBlockConfirmations ?? node.config.get('minimumBlockConfirmations'),
      0,
    )

    const account = getAccount(node, request.data.account)

    let assetIdentifier = Asset.nativeIdentifier()
    if (request.data.assetIdentifier) {
      assetIdentifier = Buffer.from(request.data.assetIdentifier, 'hex')
    }

    const balance = await node.wallet.getBalance(account, assetIdentifier, {
      minimumBlockConfirmations,
    })

    request.end({
      account: account.name,
      assetIdentifier: assetIdentifier.toString('hex'),
      confirmed: balance.confirmed.toString(),
      unconfirmed: balance.unconfirmed.toString(),
      unconfirmedCount: balance.unconfirmedCount,
      minimumBlockConfirmations,
    })
  },
)
