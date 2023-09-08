/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ASSET_METADATA_LENGTH, ASSET_NAME_LENGTH } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { CurrencyUtils, YupUtils } from '../../../utils'
import { MintAssetOptions } from '../../../wallet/interfaces/mintAssetOptions'
import { constructRpcAsset, RpcAsset, RpcAssetSchema } from '../../types'
import { ApiNamespace, routes } from '../router'
import { getAccount } from './utils'

export interface MintAssetRequest {
  account: string
  fee: string
  value: string
  assetId?: string
  expiration?: number
  expirationDelta?: number
  confirmations?: number
  metadata?: string
  name?: string
}

export interface MintAssetResponse {
  asset: RpcAsset
  /**
   * @deprecated Please use `asset.id` instead
   */
  assetId: string
  hash: string
  /**
   * @deprecated Please use `asset.name` instead
   */
  name: string
  value: string
}

export const MintAssetRequestSchema: yup.ObjectSchema<MintAssetRequest> = yup
  .object({
    account: yup.string().required(),
    fee: YupUtils.currency({ min: 1n }).defined(),
    value: YupUtils.currency({ min: 1n }).defined(),
    assetId: yup.string().optional(),
    expiration: yup.number().optional(),
    expirationDelta: yup.number().optional(),
    confirmations: yup.number().optional(),
    metadata: yup.string().optional().max(ASSET_METADATA_LENGTH),
    name: yup.string().optional().max(ASSET_NAME_LENGTH),
  })
  .defined()

export const MintAssetResponseSchema: yup.ObjectSchema<MintAssetResponse> = yup
  .object({
    asset: RpcAssetSchema.defined(),
    assetId: yup.string().required(),
    hash: yup.string().required(),
    name: yup.string().required(),
    value: yup.string().required(),
  })
  .defined()

routes.register<typeof MintAssetRequestSchema, MintAssetResponse>(
  `${ApiNamespace.wallet}/mintAsset`,
  MintAssetRequestSchema,
  async (request, node): Promise<void> => {
    const account = getAccount(node.wallet, request.data.account)

    const fee = CurrencyUtils.decode(request.data.fee)
    const value = CurrencyUtils.decode(request.data.value)

    const expirationDelta =
      request.data.expirationDelta ?? node.config.get('transactionExpirationDelta')

    let options: MintAssetOptions
    if (request.data.assetId) {
      options = {
        assetId: Buffer.from(request.data.assetId, 'hex'),
        expiration: request.data.expiration,
        fee,
        expirationDelta,
        value,
        confirmations: request.data.confirmations,
      }
    } else {
      Assert.isNotUndefined(request.data.name, 'Must provide name or identifier to mint')

      const metadata: string = request.data.metadata ?? ''

      options = {
        expiration: request.data.expiration,
        fee,
        name: request.data.name,
        metadata: metadata,
        expirationDelta,
        value,
        confirmations: request.data.confirmations,
      }
    }

    const transaction = await node.wallet.mint(account, options)
    Assert.isEqual(transaction.mints.length, 1)
    const mint = transaction.mints[0]

    request.end({
      asset: constructRpcAsset(mint.asset),
      assetId: mint.asset.id().toString('hex'),
      hash: transaction.hash().toString('hex'),
      name: mint.asset.name().toString('hex'),
      value: mint.value.toString(),
    })
  },
)
