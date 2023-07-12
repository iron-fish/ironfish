/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { CurrencyUtils, YupUtils } from '../../../utils'
import { ApiNamespace, router } from '../router'
import { getAccount } from './utils'

export interface BurnAssetRequest {
  account: string
  assetId: string
  fee: string
  value: string
  expiration?: number
  expirationDelta?: number
  confirmations?: number
}

export interface BurnAssetResponse {
  assetId: string
  hash: string
  name: string
  value: string
}

export const BurnAssetRequestSchema: yup.ObjectSchema<BurnAssetRequest> = yup
  .object({
    account: yup.string().required(),
    assetId: yup.string().required(),
    fee: YupUtils.currency({ min: 1n }).defined(),
    value: YupUtils.currency({ min: 1n }).defined(),
    expiration: yup.number().optional(),
    expirationDelta: yup.number().optional(),
    confirmations: yup.number().optional(),
  })
  .defined()

export const BurnAssetResponseSchema: yup.ObjectSchema<BurnAssetResponse> = yup
  .object({
    assetId: yup.string().required(),
    hash: yup.string().required(),
    name: yup.string().required(),
    value: yup.string().required(),
  })
  .defined()

router.register<typeof BurnAssetRequestSchema, BurnAssetResponse>(
  `${ApiNamespace.wallet}/burnAsset`,
  BurnAssetRequestSchema,
  async (request, node): Promise<void> => {
    const account = getAccount(node.wallet, request.data.account)

    const fee = CurrencyUtils.decode(request.data.fee)
    const value = CurrencyUtils.decode(request.data.value)

    const assetId = Buffer.from(request.data.assetId, 'hex')
    const asset = await node.chain.getAssetById(assetId)
    Assert.isNotNull(asset)

    const transaction = await node.wallet.burn(
      account,
      assetId,
      value,
      fee,
      request.data.expirationDelta ?? node.config.get('transactionExpirationDelta'),
      request.data.expiration,
      request.data.confirmations,
    )
    Assert.isEqual(transaction.burns.length, 1)
    const burn = transaction.burns[0]

    request.end({
      assetId: burn.assetId.toString('hex'),
      hash: transaction.hash().toString('hex'),
      name: asset.name.toString('hex'),
      value: CurrencyUtils.encode(burn.value),
    })
  },
)
