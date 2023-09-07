/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'

export interface RpcAsset {
  id: string
  metadata: string
  name: string
  nonce: number
  creator: string
  owner: string
  createdTransactionHash: string
  supply?: string // Populated for assets the account owns
  blockHash?: string // Populated once the asset has been added to the main chain
  sequence?: number // Populated once the asset has been added to the main chain
}

export const RpcAssetSchema: yup.ObjectSchema<RpcAsset> = yup
  .object({
    id: yup.string().required(),
    metadata: yup.string().required(),
    name: yup.string().required(),
    nonce: yup.number().required(),
    creator: yup.string().required(),
    owner: yup.string().required(),
    createdTransactionHash: yup.string().required(),
    supply: yup.string().optional(),
    blockHash: yup.string().optional(),
    sequence: yup.number().optional(),
  })
  .defined()
