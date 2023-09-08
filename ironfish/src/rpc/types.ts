/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'
import { Asset } from '../../../ironfish-rust-nodejs'
import { AssetValue as BlochcainAssetValue } from '../blockchain/database/assetValue'
import { AssetValue as WalletAssetValue } from '../wallet/walletdb/assetValue'

export interface RpcAsset {
  id: string
  metadata: string
  name: string
  nonce: number
  creator: string
  // chain?: {
  //   owner?: string
  //   supply?: string // Populated for assets the account owns
  //   blockHash: string
  //   blockSequence: number
  //   createdAtTransactionHash?: string // Populated once the asset has been added to the main chain
  //   createdAtblockHash?: string // Populated once the asset has been added to the main chain
  //   createdAtSequence?: number // Populated once the asset has been added to the main chain
  // }
}

export const RpcAssetSchema: yup.ObjectSchema<RpcAsset> = yup
  .object({
    id: yup.string().required(),
    metadata: yup.string().required(),
    name: yup.string().required(),
    nonce: yup.number().required(),
    creator: yup.string().required(),
    owner: yup.string().optional(),
  })
  .defined()

export const constructRpcAsset = (
  asset: Asset | WalletAssetValue | BlochcainAssetValue,
): RpcAsset => {
  return {
    id: asset.id.toString('hex'),
    metadata: asset.metadata.toString('hex'),
    name: asset.name.toString('hex'),
    nonce: typeof asset.nonce === 'number' ? asset.nonce : asset.nonce(),
    creator: asset.creator.toString('hex'),
  }
}
