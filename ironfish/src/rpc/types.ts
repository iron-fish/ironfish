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
  /**
   * @deprecated query for the transaction to find it's status
   */
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

export type RpcEncryptedNote = {
  /**
   * @deprecated Please use hash instead
   */
  commitment: string
  hash: string
  serialized: string
}

export const RpcEncryptedNoteSchema: yup.ObjectSchema<RpcEncryptedNote> = yup
  .object({
    commitment: yup.string().defined(),
    hash: yup.string().defined(),
    serialized: yup.string().defined(),
  })
  .defined()

export type RpcNote = {
  assetId: string
  owner: string
  sender: string
  hash: string
  value: string
  memo: string
  transactionHash: string
  /**
   * @deprecated Please use getAsset endpoint to get this information
   */
  assetName: string
  /**
   * @deprecated Please use hash instead
   */
  noteHash: string
}

export const RpcNoteSchema = yup
  .object()
  .shape({
    assetId: yup.string().required(),
    assetName: yup.string().required(),
    hash: yup.string().required(),
    value: yup.string().required(),
    memo: yup.string().required(),
    owner: yup.string().required(),
    sender: yup.string().required(),
    transactionHash: yup.string().required(),
    noteHash: yup.string().required(),
  })
  .required()
