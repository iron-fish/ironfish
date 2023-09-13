/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'
import { AssetVerification } from '../assets'

export type RpcAsset = {
  id: string
  metadata: string
  name: string
  nonce: number
  creator: string
  verification: AssetVerification
  createdTransactionHash: string
  owner: string
  status: string
  supply?: string
}

export const RpcAssetSchema: yup.ObjectSchema<RpcAsset> = yup
  .object({
    id: yup.string().required(),
    metadata: yup.string().required(),
    name: yup.string().required(),
    nonce: yup.number().required(),
    creator: yup.string().required(),
    verification: yup
      .object({ status: yup.string().oneOf(['verified', 'unverified', 'unknown']).defined() })
      .defined(),
    status: yup.string().defined(),
    supply: yup.string().optional(),
    owner: yup.string().defined(),
    createdTransactionHash: yup.string().defined(),
  })
  .defined()
